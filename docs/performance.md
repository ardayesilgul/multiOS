# multiOS Performance Characteristics & Benchmarking

Guidelines for throughput optimization and resource containment when streaming files and media over local Wi-Fi.

## Throughput Optimization

1. **Buffer Strategy:**
   - Stream reads bypass Node.js string decoding and pipe raw binary streams directly into native filesystem descriptors.
   - High-water mark tuned to 64 KB for responsive backpressure handshakes over Wi-Fi 5 / 6 links.

2. **Memory Footprint:**
   - Idle background state: ~28–35 MB private working set.
   - Active 1 Gbps file streaming: peaks at <65 MB RSS due to zero intermediate in-memory buffering.

3. **Garbage Collection Optimization:**
   - Pre-allocated TypedArray buffers are recycled across chunk events to minimize V8 heap churn during rapid burst photo transfers.
