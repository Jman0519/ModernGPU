// the verties that are passed in
@binding(0) @group(0) var<storage, read> points: array<vec2<f32>>;

// since we need to output multiple things from the vertex shader, we need to create a struct
// we need to output the position (because gpu requires it) and the color (because we want to)
struct Output {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

@vertex
fn vr_main(@builtin(vertex_index) vertex_index: u32) -> Output {
    var output: Output;
    output.position = vec4(points[vertex_index], 0.0, 1.0);
    output.color = output.position;
    return output;
}

@fragment
fn fr_main(@builtin(position) position: vec4<f32>, @location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
    return ((color + 1.0) * 0.5) - vec4(0.0, 0.0, 1.0, 0.0);
    // return ((color + 1.0) * 0.5);
    // return color; // see how 0,0 is the center, and -1 -1 is the bottom left (like a normal graph)
}