@binding(0) @group(0) var<storage, read> points: array<vec2<f32>>;

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    return vec4(points[index], 0.0, 1.0); // return the point for this vertex
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0); // red
}