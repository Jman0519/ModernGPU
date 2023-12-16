@group(0) @binding(0) var<uniform> size: vec2<u32>;
@group(0) @binding(2) var<storage, read_write> cells: array<u32>;


@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    const verticies = array<vec2<f32>, 4>(
        vec2(-1.0, -1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0,  1.0),
        vec2( 1.0,  1.0)
    );

    return vec4<f32>(verticies[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    var max = size.x * size.y;
    var index = u32(floor(position.x + (position.y * f32(size.x))));
    var cell = cells[index];
    var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    if (cell == 1u) {
        color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }
    return color;
}