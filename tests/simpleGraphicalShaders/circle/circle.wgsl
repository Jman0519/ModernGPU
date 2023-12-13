// the verties that are passed in
@binding(0) @group(0) var<storage, read> points: array<vec2<f32>>;

// since we need to output multiple things from the vertex shader, we need to create a struct
// we need to output the position (because gpu requires it) and the color (because we want to)
struct Output {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec4<f32>,
}

@vertex
fn vr_main(@builtin(vertex_index) vertex_index: u32) -> Output {
    var output: Output;
    output.position = vec4(points[vertex_index], 0.0, 1.0);
    output.uv = ((output.position * vec4(1,-1,1,1)) + 1 ) / 2;
    return output;
}

@fragment
fn fr_main(@builtin(position) position: vec4<f32>, @location(0) uv: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<f32>(round(position.x/uv.x), round(position.y/uv.y));
    var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    const radius = 100;
    var centerX = 0.0;
    var centerY = 0.0;
    for(var i = 0u; i < arrayLength(&points); i = i + 1u) {
        centerX = centerX + (((points[i].x + 1) / 2) * size.x);
        centerY = centerY + (((points[i].y + 1) / 2) * size.y);
    }
    centerX = centerX / f32(arrayLength(&points));
    centerY = centerY / f32(arrayLength(&points));
    let center = vec2<f32>(centerX, centerY);
    color.x = radius - distance(center, position.xy);
    return color;
}