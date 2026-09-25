"""Compare speed and every returned probability on the frozen GPU fixture."""
import json
import sys
from pathlib import Path

root = Path('benchmarks/gpu-path')
baseline = json.loads((root / (sys.argv[1]+'.json')).read_text())
for label in sys.argv[2:]:
    candidate = json.loads((root / (label+'.json')).read_text())
    assert baseline['fixtureSha256'] == candidate['fixtureSha256']
    assert len(baseline['records']) == len(candidate['records'])
    differences, flips = [], []
    for a,b in zip(baseline['records'],candidate['records'],strict=True):
        assert (a['id'], a['repeat']) == (b['id'], b['repeat'])
        assert a['response']['usage'] == b['response']['usage']
        for key, x in a['response']['answers'].items():
            y = b['response']['answers'][key]
            assert x['type'] == y['type']
            px = x.get('probabilities', {'true':x.get('noul')})
            py = y.get('probabilities', {'true':y.get('noul')})
            assert px.keys() == py.keys()
            differences.extend(abs(px[k]-py[k]) for k in px)
            choice_x = x.get('choice', x.get('noul',0)>=.5)
            choice_y = y.get('choice', y.get('noul',0)>=.5)
            if choice_x != choice_y:
                flips.append([a['id'],key,choice_x,choice_y])
    result = {'baseline':sys.argv[1], 'candidate':label, 'speedup':candidate['summary']['decisionsPerSecond']/baseline['summary']['decisionsPerSecond'], 'maxProbabilityDelta':max(differences), 'meanProbabilityDelta':sum(differences)/len(differences), 'thresholdOrChoiceFlips':flips, 'summary':candidate['summary']}
    (root / (label+'-comparison.json')).write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
