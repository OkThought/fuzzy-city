"""Local JevK5 launcher with explicit, bounded GPU runtime options.

Uses upstream HTTP handling, weights, prompts, calibration and readout unchanged.
"""
import argparse
import inspect
import json
from http.server import ThreadingHTTPServer

parser = argparse.ArgumentParser()
parser.add_argument('--model', default='alibiserikbay/JevK5')
parser.add_argument('--revision', default='27d2d6b8d4714807f6293b0623bd7370b27e42f8')
parser.add_argument('--port', type=int, default=8090)
parser.add_argument('--kernels', choices=['reference', 'fla'], default='fla')
parser.add_argument('--graph-lengths', default='')
parser.add_argument('--triton-conv', action='store_true')
args = parser.parse_args()

import torch
from transformers.models.qwen3_5 import modeling_qwen3_5 as qwen

if args.kernels == 'reference':
    qwen.torch_chunk_gated_delta_rule = inspect.unwrap(qwen.torch_chunk_gated_delta_rule)
else:
    # Explicit import fails visibly if the acceleration dependency cannot load.
    from fla.ops.gated_delta_rule import chunk_gated_delta_rule
    qwen.torch_chunk_gated_delta_rule = chunk_gated_delta_rule

if args.triton_conv:
    from jevk5_gpu import triton_causal_conv1d
    qwen.causal_conv1d_fn = triton_causal_conv1d

from jevk5 import JevK5
from jevk5.server import make_handler
from huggingface_hub import snapshot_download
# Never let an upstream model update invalidate the paired comparison.
source = snapshot_download(args.model, revision=args.revision, local_files_only=True)
model = JevK5(source, graphs=False)
lengths = sorted(set(int(x) for x in args.graph_lengths.split(',') if x))
if lengths:
    if len(lengths) > 3 or any(n < 128 or n > 4096 for n in lengths):
        raise ValueError('Use at most three graph lengths between 128 and 4096')
    model.capture(lengths)
print(json.dumps({'model': args.model, 'revision':args.revision, 'kernels':args.kernels, 'tritonConv':args.triton_conv, 'graphLengths':lengths, 'torch':torch.__version__, 'allocatedMiB':torch.cuda.memory_allocated() // 1048576, 'reservedMiB':torch.cuda.memory_reserved() // 1048576}), flush=True)
server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(model, args.model))
print(f'serving on http://127.0.0.1:{args.port}', flush=True)
server.serve_forever()
