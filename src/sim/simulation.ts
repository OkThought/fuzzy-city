import type { DecisionEngine } from "../ai/decisionEngine";
import { dayMetrics, generateCity } from "./cityGenerator";
import { activityDistribution, context, decisionState } from "./decisions";
import { move, travel } from "./movement";
import { applyInteraction, isFriend } from "./relationships";
import { clamp, entropy, Rng, sample } from "./rng";
import {
  LABELS,
  type Activity,
  type Citizen,
  type CityEvent,
  type DecisionTrace,
  type Evaluation,
  type Job,
  type Location,
  type World,
} from "./types";

export class Simulation {
  world: World;
  rng: Rng;
  queueSize = 0;
  busy = false;
  private locations: Map<string, Location>;
  private citizens: Map<string, Citizen>;
  private reserved = new Set<string>();
  constructor(
    public engine: DecisionEngine,
    world = generateCity(),
  ) {
    this.world = world;
    this.rng = new Rng(world.rngState);
    this.locations = new Map(world.locations.map((l) => [l.id, l]));
    this.citizens = new Map(world.citizens.map((c) => [c.id, c]));
  }
  get today() {
    return this.world.metrics[this.world.metrics.length - 1];
  }
  event(
    type: CityEvent["type"],
    text: string,
    citizenIds: string[] = [],
    traceIds: string[] = [],
  ) {
    const w = this.world;
    w.events.push({
      id: `event_${w.events.length}`,
      day: w.day,
      minute: w.minute,
      type,
      text,
      citizenIds,
      traceIds,
    });
  }
  changePrinciple(principle: string) {
    const value = principle.trim().slice(0, 400);
    if (!value || value === this.world.principle) return;
    this.world.principle = value;
    this.world.principleHistory.push({
      day: this.world.day,
      minute: this.world.minute,
      principle: value,
    });
    this.event(
      "CharterChangedEvent",
      "City principle changed. Future judgments will receive the new norm.",
    );
  }
  private job(c: Citizen, kind: Job["kind"]): Job {
    return {
      id: `${this.world.day}:${kind}:${c.id}`,
      kind,
      state: decisionState(this.world, c),
    };
  }
  private async evaluate(jobs: Job[]) {
    this.queueSize = jobs.length;
    try {
      const results = await this.engine.evaluate(jobs);
      if (results.length !== jobs.length)
        throw new Error("Incomplete decision batch");
      return results;
    } finally {
      this.queueSize = 0;
    }
  }
  private trace(
    job: Job,
    result: Evaluation,
    citizenIds: string[],
  ): DecisionTrace {
    const w = this.world;
    const count =
      job.kind === "friend_selection" ? 1 : Object.keys(result.answers).length;
    const uncertainties =
      job.kind === "friend_selection"
        ? {}
        : Object.fromEntries(
            Object.entries(result.answers).map(([key, p]) => [key, entropy(p)]),
          );
    const trace: DecisionTrace = {
      ...result,
      id: `trace_${w.traces.length}`,
      simulationDay: w.day,
      simulationMinute: w.minute,
      citizenIds,
      kind: job.kind,
      stateSnapshot: job.state,
      derivedValues: { uncertainties },
      outcome: {},
      createdAt: (w.day - 1) * 1440 + w.minute,
    };
    w.traces.push(trace);
    w.judgments += count;
    w.apiCalls += result.apiCalls;
    w.inputTokens += result.inputTokens;
    w.outputTokens += result.outputTokens;
    this.today.judgments += count;
    this.today.apiCalls += result.apiCalls;
    for (const value of Object.values(uncertainties)) {
      this.today.uncertaintySum += value;
      this.today.noulCount++;
    }
    this.today.meanUncertainty = this.today.noulCount
      ? this.today.uncertaintySum / this.today.noulCount
      : 0;
    return trace;
  }
  private destination(c: Citizen, activity: Activity): Location {
    if (activity === "home_rest" || activity === "visit_friend")
      return this.locations.get(c.homeId)!;
    if (activity === "overtime") return this.locations.get(c.workplaceId)!;
    const kinds =
      activity === "cafe"
        ? ["cafe"]
        : activity === "park"
          ? ["park"]
          : ["gallery", "landmark", "plaza", "park"];
    const counts = new Map<string, number>();
    for (const citizen of this.world.citizens) {
      if (citizen.currentPlan?.day === this.world.day)
        counts.set(
          citizen.currentPlan.destinationId,
          (counts.get(citizen.currentPlan.destinationId) ?? 0) + 1,
        );
    }
    const candidates = this.world.locations.filter(
      (l) => kinds.includes(l.kind) && (counts.get(l.id) ?? 0) < l.capacity,
    );
    return this.rng.pick(
      candidates.length
        ? candidates
        : this.world.locations.filter((l) => l.kind === "plaza"),
    );
  }
  private async intentions(citizens: Citizen[]) {
    const jobs = citizens.map((c) => this.job(c, "evening_intentions"));
    const results = await this.evaluate(jobs);
    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i],
        trace = this.trace(jobs[i], results[i], [c.id]);
      const positive = jobs[i].state.citizen.known_people.filter(
        (r) => r.affinity > 0 && r.familiarity > 0.1,
      );
      const distribution = activityDistribution(
        c,
        trace.answers,
        Math.min(1, positive.reduce((s, r) => s + r.affinity, 0) / 1.5),
      );
      const draw = this.rng.next(),
        activity = sample(distribution.probabilities, draw) as Activity;
      trace.derivedValues = {
        ...trace.derivedValues,
        ...distribution,
        rngSample: draw,
      };
      trace.outcome = { sampledAction: activity };
      c.judgmentUncertainties = trace.derivedValues.uncertainties!;
      c.uncertainty =
        Object.values(c.judgmentUncertainties).reduce((s, v) => s + v, 0) / 5;
      const destination = this.destination(c, activity);
      c.currentPlan = {
        day: this.world.day,
        activity,
        destinationId: destination.id,
        intentionTraceId: trace.id,
      };
      trace.outcome.destinationId = destination.id;
      this.today.activities[activity]++;
      travel(c, destination, this.rng);
      this.event(
        "decision",
        `${c.firstName} ${c.lastName} sampled “${LABELS[activity].toLowerCase()}”.`,
        [c.id],
        [trace.id],
      );
    }
  }
  private async friends() {
    this.reserved.clear();
    // Stable citizen order and reservations make visits disjoint. A host accepts a
    // deterministic invitation; the model's original sampled intention stays intact.
    for (const c of this.world.citizens) {
      if (
        c.currentPlan?.day !== this.world.day ||
        c.currentPlan.activity !== "visit_friend" ||
        this.reserved.has(c.id)
      )
        continue;
      const job = this.job(c, "friend_selection");
      job.state.candidates = Object.fromEntries(
        job.state.citizen.known_people
          .filter(
            (r) =>
              r.affinity > 0 &&
              !this.reserved.has(r.toCitizenId) &&
              this.citizens.get(r.toCitizenId)?.currentPlan?.activity !==
                "visit_friend",
          )
          .sort((a, b) => b.affinity - a.affinity)
          .slice(0, 5)
          .map((r) => [r.toCitizenId, r]),
      );
      const [result] = await this.evaluate([job]);
      const trace = this.trace(job, result, [c.id]);
      const draw = this.rng.next(),
        selected = sample(result.answers, draw);
      trace.derivedValues = { probabilities: result.answers, rngSample: draw };
      trace.outcome = { selected };
      c.currentPlan.friendTraceId = trace.id;
      const friend =
        selected === "none" ? undefined : this.citizens.get(selected);
      if (!friend) {
        const l = this.destination(c, "cafe");
        c.currentPlan.destinationId = l.id;
        c.currentPlan.resolvedActivity = "cafe";
        c.currentPlan.resolution = "No contact sampled; redirected to a café.";
        trace.outcome.destinationId = l.id;
        travel(c, l, this.rng);
      } else {
        const l = this.locations.get(friend.homeId)!;
        this.reserved.add(c.id);
        this.reserved.add(friend.id);
        c.currentPlan.friendId = friend.id;
        c.currentPlan.destinationId = l.id;
        friend.currentPlan!.destinationId = l.id;
        friend.currentPlan!.friendId = c.id;
        friend.currentPlan!.resolvedActivity = "visit_friend";
        friend.currentPlan!.resolution = `Hosting ${c.firstName}; accepted a scheduled visit.`;
        trace.outcome.destinationId = l.id;
        trace.outcome.hostIntentionTraceId =
          friend.currentPlan!.intentionTraceId;
        travel(c, l, this.rng);
        travel(friend, l, this.rng);
        this.event(
          "resolution",
          `${c.firstName} will visit ${friend.firstName} at home.`,
          [c.id, friend.id],
          [
            trace.id,
            c.currentPlan.intentionTraceId,
            friend.currentPlan!.intentionTraceId,
          ],
        );
      }
    }
    this.world.friendsResolvedDay = this.world.day;
  }
  private async interactions() {
    const groups = new Map<string, Citizen[]>();
    const pairs: [Citizen, Citizen][] = [];
    const used = new Set<string>();
    for (const c of this.world.citizens) {
      if (!c.currentLocationId || c.interactedDay === this.world.day) continue;
      const friendId =
        c.currentPlan?.day === this.world.day
          ? c.currentPlan.friendId
          : undefined;
      if (friendId && !used.has(c.id)) {
        const b = this.citizens.get(friendId)!;
        if (
          b.currentLocationId === c.currentLocationId &&
          !used.has(b.id) &&
          b.interactedDay !== this.world.day
        ) {
          pairs.push([c, b]);
          used.add(c.id);
          used.add(b.id);
        }
      }
    }
    for (const c of this.world.citizens) {
      if (
        used.has(c.id) ||
        c.interactedDay === this.world.day ||
        c.currentPlan?.friendId ||
        !c.currentLocationId
      )
        continue;
      const l = this.locations.get(c.currentLocationId)!;
      if (!["cafe", "park", "plaza", "gallery", "landmark"].includes(l.kind))
        continue;
      const occupants = groups.get(l.id) ?? [];
      occupants.push(c);
      groups.set(l.id, occupants);
    }
    for (const group of groups.values()) {
      const occupants = this.rng.shuffle(group);
      for (let i = 0; i + 1 < occupants.length; i += 2) {
        const a = occupants[i],
          b = occupants[i + 1];
        if (Math.abs(a.traits.sociability - b.traits.sociability) < 0.65)
          pairs.push([a, b]);
      }
    }
    if (!pairs.length) return;
    const jobs = pairs.map(([a, b]) => {
      const job = this.job(a, "social_interaction");
      job.id += `:${b.id}`;
      job.state.other = context(this.world, b);
      job.state.locationId = a.currentLocationId;
      return job;
    });
    const results = await this.evaluate(jobs);
    pairs.forEach(([a, b], i) => {
      const trace = this.trace(jobs[i], results[i], [a.id, b.id]);
      const update = applyInteraction(this.world, a, b, trace);
      trace.outcome = {
        deltaA: update.deltaA,
        deltaB: update.deltaB,
        locationId: a.currentLocationId,
        aIntentionTraceId: a.currentPlan!.intentionTraceId,
        bIntentionTraceId: b.currentPlan!.intentionTraceId,
      };
      this.today.interactions++;
      this.today.locations[a.currentLocationId] =
        (this.today.locations[a.currentLocationId] ?? 0) + 1;
      this.event(
        "interaction",
        `${a.firstName} × ${b.firstName} met at ${this.locations.get(a.currentLocationId)!.name}.`,
        [a.id, b.id],
        [trace.id],
      );
      if (update.newFriends)
        this.event(
          "friendship",
          `${a.firstName} × ${b.firstName}: ${update.newFriends} directed bond crossed the friendship threshold.`,
          [a.id, b.id],
          [trace.id],
        );
    });
  }
  updateMetrics() {
    const relationships = Object.values(this.world.relationships);
    this.today.friendships = relationships.filter(isFriend).length;
    this.today.negativeRelationships = relationships.filter(
      (r) => r.affinity < 0,
    ).length;
    this.today.alone = this.world.citizens.filter(
      (c) =>
        c.currentPlan?.day === this.world.day &&
        c.interactedDay !== this.world.day,
    ).length;
  }
  async step(minutes = 1): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let step = 0; step < minutes; step++) {
        const w = this.world;
        w.minute++;
        if (w.minute >= 1440) {
          this.updateMetrics();
          w.minute = 0;
          w.day++;
          w.metrics.push(dayMetrics(w.day));
          this.event(
            "day",
            `Day ${w.day}. Yesterday’s connections become today’s context.`,
          );
        }
        if (w.minute >= 1020 && w.minute < 1070) {
          const offset = (w.minute - 1020) * 20;
          await this.intentions(
            w.citizens
              .slice(offset, offset + 20)
              .filter((c) => c.currentPlan?.day !== w.day),
          );
        }
        if (w.minute === 1080 && w.friendsResolvedDay !== w.day)
          await this.friends();
        const arrivals: Record<string, number> = {};
        for (const c of w.citizens) {
          if (w.minute === 420)
            travel(c, this.locations.get(c.workplaceId)!, this.rng);
          if (w.minute === 1380)
            travel(c, this.locations.get(c.homeId)!, this.rng);
          if (move(c)) {
            arrivals[c.currentLocationId] =
              (arrivals[c.currentLocationId] ?? 0) + 1;
            if (
              c.currentPlan?.day === w.day &&
              (c.currentPlan.resolvedActivity ?? c.currentPlan.activity) ===
                "cafe" &&
              this.locations.get(c.currentLocationId)?.kind === "cafe"
            )
              c.state.money = Math.max(
                0,
                c.state.money - Math.min(c.state.money, 6),
              );
          }
          if (!c.route.length)
            c.activity =
              w.minute < 420
                ? "sleep"
                : w.minute < 1020
                  ? w.minute < 540
                    ? "commute"
                    : "work"
                  : w.minute >= 1380
                    ? "home_rest"
                    : c.currentPlan?.day === w.day
                      ? (c.currentPlan.resolvedActivity ??
                        c.currentPlan.activity)
                      : "work";
          if (c.activity === "sleep" || c.activity === "home_rest") {
            c.state.energy = clamp(c.state.energy + 0.0013);
            c.state.stress = clamp(c.state.stress - 0.0008);
          } else if (c.activity === "work" || c.activity === "overtime") {
            c.state.energy = clamp(c.state.energy - 0.00065);
            c.state.stress = clamp(c.state.stress + 0.0004);
            c.state.money += 0.1 + c.traits.ambition * 0.1;
          } else {
            c.state.energy = clamp(c.state.energy - 0.00018);
            if (c.activity === "park")
              c.state.stress = clamp(c.state.stress - 0.0005);
          }
          c.state.socialNeed = clamp(
            c.state.socialNeed + (c.lastContactDay < w.day ? 0.00018 : 0.00004),
          );
        }
        if (w.minute >= 1020 && w.minute < 1380)
          for (const [id, count] of Object.entries(arrivals))
            if (count > 2)
              this.event(
                "arrival",
                `${count} citizens arrived at ${this.locations.get(id)!.name}.`,
              );
        if (w.minute >= 1140 && w.minute < 1380 && w.minute % 15 === 0)
          await this.interactions();
        if (w.minute % 15 === 0) this.updateMetrics();
        w.rngState = this.rng.state;
      }
    } finally {
      this.busy = false;
    }
  }
  async skipToEvening() {
    const target = this.world.minute < 1140 ? 1140 : 1440 + 1140;
    await this.step(target - this.world.minute);
  }
}
