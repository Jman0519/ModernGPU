import { ModernGpu } from "../../../ModernGPU.js";

async function main() {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let gpu = await ModernGpu.init();

    let src = await (await fetch("circle.wgsl")).text();

    let storageBuffers = [];
    let verticies = [
        -1, -1, // bottom left
        -1, 1, // top left
        1, -1, // bottom right
        1, 1, // top right
    ]
    storageBuffers.push(gpu.createStorageBuffer(new Float32Array(verticies), 0));

    let inputBuffers = [];
    let outputBuffers = [];

    let renderShader = gpu.compileRenderShader(ctx, src, storageBuffers, inputBuffers, outputBuffers, verticies.length / 2, "vr_main", "fr_main", gpu.topology.triangleStrip);
    renderShader.run();
}

main();