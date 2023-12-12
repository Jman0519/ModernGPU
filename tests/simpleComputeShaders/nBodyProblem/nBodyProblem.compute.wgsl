struct nbody {
    pos: vec2<f32>,
    vel: vec2<f32>,
    mass: f32,
    radius: f32,
}

struct parameters {
    G: f32,
    dt: f32,
}

@binding(0) @group(0) var<storage, read> params: parameters;
@binding(1) @group(0) var<storage, read> numBodies: u32;
@binding(2) @group(0) var<storage, read_write> current: array<nbody>;
@binding(3) @group(0) var<storage, read_write> next: array<nbody>;

fn calcAccelerationOfBodyX(x: u32) -> vec2<f32> {
    var a = vec2<f32>(0.0, 0.0);
    for (var y: u32 = 0u; y < numBodies; y = y + 1u) {
        if (x != y) {
            let r = (current[y].pos - current[x].pos) / 1000;
            let d = length(r);
            a = a + ((normalize(r) * params.G * current[y].mass) / (d*d));
        }
    }
    return a;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) grid: vec3<u32>) {
    let x = grid.x;
    let a = calcAccelerationOfBodyX(x);
    let v = current[x].vel + (a * params.dt);
    let p = current[x].pos + (v * params.dt);
    next[x] = nbody(p, v, current[x].mass, current[x].radius);
}