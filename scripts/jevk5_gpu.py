"""Adapters for installed FLA kernels; no changes to JevK5 prompt/readout."""
def triton_causal_conv1d(hidden_states, weight, bias=None, activation=None, **kwargs):
    from fla.modules.conv import causal_conv1d
    # Transformers uses B,D,T; FLA uses B,T,D. No recurrent state: JevK5
    # evaluates complete prompts with use_cache=False.
    output, _ = causal_conv1d(
        x=hidden_states.transpose(1, 2), weight=weight, bias=bias,
        activation=activation, backend='triton', output_final_state=False,
    )
    return output.transpose(1, 2)
