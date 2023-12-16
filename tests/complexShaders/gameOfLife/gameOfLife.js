import { ModernGpu } from "../../../ModernGPU.js";

async function main() {
    let lifeSize = 2048;
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = lifeSize;
    canvas.height = lifeSize;

    let gpu = await ModernGpu.init();

    let src = await (await fetch("gameOfLife.compute.wgsl")).text();
    let renderSrc = await (await fetch("gameOfLife.render.wgsl")).text();

    let uniformBuffers = [];
    uniformBuffers.push(gpu.createUniformBuffer(new Uint32Array([lifeSize, lifeSize]), 0));

    let storageBuffers = [];

    let inputBuffers = [];
    let start = new Uint32Array(lifeSize * lifeSize);
    for (let i = 0; i < lifeSize * lifeSize; i++) {
        start[i] = Math.random() > 0.5 ? 1 : 0;
    }
    inputBuffers.push(gpu.createInputBuffer(start, 1));

    let outputBuffers = [];
    outputBuffers.push(gpu.createOutputBuffer(new Uint32Array(lifeSize * lifeSize), 2));

    let kernel = gpu.compileComputeShader(src, uniformBuffers, storageBuffers, inputBuffers, outputBuffers, [lifeSize / 16, lifeSize / 16], "main");
    let renderKernel = gpu.compileRenderShader(ctx, renderSrc, uniformBuffers, storageBuffers, inputBuffers, outputBuffers, 4, "vs_main", "fs_main", gpu.topology.triangleStrip);

    for (let i = 0; i < 1000; i++) {
        kernel.run(false, [[outputBuffers[0], inputBuffers[0]]]);
        renderKernel.run(false);

        await sleep(0.00001);
        console.log(i);
    }
}

main();

async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}