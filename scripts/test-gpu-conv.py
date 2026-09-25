"""Check the layout adapter against the reference operation before serving."""
import torch
from jevk5_gpu import triton_causal_conv1d
torch.manual_seed(731)
with torch.inference_mode():
    for length in [137, 1236, 2279]:
        x = torch.randn(1, 64, length, device='cuda', dtype=torch.bfloat16)
        w = torch.randn(64, 4, device='cuda', dtype=torch.bfloat16)
        for use_bias in [False, True]:
            bias = torch.randn(64, device='cuda', dtype=torch.bfloat16) if use_bias else None
            expected = torch.nn.functional.silu(torch.nn.functional.conv1d(x, w.unsqueeze(1), bias, padding=3, groups=64)[:,:,:length])
            actual = triton_causal_conv1d(x,w,bias,activation='silu')
            # BF16 differs because the optimized kernel fuses activation.
            torch.testing.assert_close(actual, expected, atol=.04, rtol=.02)
            print(length, use_bias, 'max absolute difference', (actual-expected).abs().max().item())
