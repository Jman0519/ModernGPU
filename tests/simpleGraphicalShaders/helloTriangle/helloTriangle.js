import { ModernGpu } from "../../../ModernGPU.js";

async function main() {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let gpu = await ModernGpu.init();

    let src = await (await fetch("helloTriangle.wgsl")).text();

    let storageBuffers = [];
    storageBuffers.push(gpu.createStorageBuffer(new Float32Array([
        -0.5, -0.5, // bottom left point of triangle
        0.0, 0.8, // top middle point of triangle
        0.5, -0.5 // bottom right point of triangle
    ]), 0));

    let inputBuffers = [];
    let outputBuffers = [];

    let renderShader = gpu.compileRenderShader(ctx, src, storageBuffers, inputBuffers, outputBuffers, 3);
    renderShader.run();
}

main();