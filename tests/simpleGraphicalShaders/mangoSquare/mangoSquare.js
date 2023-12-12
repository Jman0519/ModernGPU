import { ModernGpu } from "../../../ModernGPU.js";

async function main() {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let gpu = await ModernGpu.init();

    let src = await (await fetch("mangoSquare.wgsl")).text();

    let storageBuffers = [];
    storageBuffers.push(gpu.createStorageBuffer(new Float32Array([
        -1, -1, // bottom left
        -1, 1, // top left
        1, -1, // bottom right
        1, 1, // top right
    ]), 0));

    let inputBuffers = [];
    let outputBuffers = [];

    let renderShader = gpu.compileRenderShader(ctx, src, storageBuffers, inputBuffers, outputBuffers, "vr_main", "fr_main", gpu.topology.triangleStrip);
    renderShader.run();
}

main();