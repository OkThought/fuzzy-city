"""Fixed-input HTTP GPU comparison; no simulation/prompt/model changes."""
import argparse
import hashlib
import json
import math
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--label', required=True)
parser.add_argument('--repeats', type=int, default=3)
parser.add_argument('--url', default='http://127.0.0.1:8090')
args = parser.parse_args()
if args.repeats < 1 or not args.label.replace('-', '').replace('_', '').isalnum():
    parser.error('Use a positive repeat count and an alphanumeric report label')
root = Path('benchmarks/gpu-path')
output = root / (args.label+'.json')
if output.exists():
    parser.error('Report already exists; choose a new label to preserve evidence')
fixture_bytes = (root / 'fixture.json').read_bytes()
cases = json.loads(fixture_bytes)['cases']
samples = []
stop = threading.Event()

def gpu():
    while not stop.is_set():
        try:
            raw = subprocess.check_output(['nvidia-smi', '--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], text=True, timeout=5)
            samples.append({'time': time.time(), 'devices': [[int(x.strip()) for x in row.split(',')] for row in raw.strip().splitlines()]})
        except Exception as error:
            samples.append({'time': time.time(), 'error': str(error)})
        stop.wait(0.5)

def call(case):
    req = urllib.request.Request(args.url + '/v1/systemone', data=json.dumps(case['request']).encode(), headers={'Content-Type':'application/json'})
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=180) as response:
        result = json.load(response)
    elapsed = (time.perf_counter() - start) * 1000
    assert set(result['answers']) == set(case['request']['questions'])
    for answer in result['answers'].values():
        values = list(answer['probabilities'].values()) if 'probabilities' in answer else [answer['noul']]
        assert all(math.isfinite(v) and 0 <= v <= 1 for v in values)
        if 'probabilities' in answer:
            assert abs(sum(values)-1) < 1e-5
    return {'id': case['id'], 'kind':case['kind'], 'latencyMs':elapsed, 'response':result}

thread = threading.Thread(target=gpu, daemon=True)
thread.start()
report = {'label': args.label, 'startedAt':time.time(), 'fixtureSha256': hashlib.sha256(fixture_bytes).hexdigest(), 'concurrency':1, 'queueDepth':0, 'warmup':[], 'records':[], 'gpuSamples':samples}
try:
    # Warm every input shape; JIT/graph compilation excluded, retained separately.
    for case in cases:
        report['warmup'].append(call(case))
        print(f"warmup {case['id']}: {report['warmup'][-1]['latencyMs']:.1f} ms", flush=True)
    started = time.perf_counter()
    for repeat in range(args.repeats):
        for case in cases:
            record = call(case)
            record['repeat'] = repeat
            report['records'].append(record)
        print(f'{args.label}: repeat {repeat+1}/{args.repeats}', flush=True)
    elapsed = time.perf_counter()-started
    latencies = sorted(r['latencyMs'] for r in report['records'])
    report['summary'] = {'elapsedSeconds':elapsed, 'requests':len(latencies), 'decisionsPerSecond':len(latencies)/elapsed, 'judgmentsPerSecond':sum(len(r['response']['answers']) for r in report['records'])/elapsed, 'p50Ms':latencies[math.ceil(len(latencies)*.5)-1], 'p95Ms':latencies[math.ceil(len(latencies)*.95)-1], 'peakVramMiB':max((d[0] for s in samples for d in s.get('devices',[])), default=None)}
except Exception as error:
    report['error'] = repr(error)
    raise
finally:
    stop.set()
    thread.join(timeout=6)
    output.write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps(report.get('summary', {'error':report.get('error')})), flush=True)
