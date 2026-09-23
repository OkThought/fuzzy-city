import FuzzyCity from "../components/FuzzyCity";
export const dynamic = "force-dynamic";
export default function Page() {
  const price = (value: string | undefined) =>
    value?.trim() && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Number(value)
      : null;
  return (
    <FuzzyCity
      mode={process.env.JEV_MODE === "live" ? "live" : "mock"}
      pricing={{
        input: price(process.env.JEV_INPUT_PRICE_PER_MILLION),
        output: price(process.env.JEV_OUTPUT_PRICE_PER_MILLION),
      }}
    />
  );
}
