import { ModernGpu, ModernGpuBuffer, ComputeKernel, RenderKernel } from "../../../ModernGPU.js";

async function main() {
    let lifeSize = 2048;
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = lifeSize;
    canvas.height = lifeSize;

    await ModernGpu.init();
    let gpu = new ModernGpu();

    let src = await (await fetch("gameOfLife.compute.wgsl")).text();
    let renderSrc = await (await fetch("gameOfLife.render.wgsl")).text();

    let buffers = [];
    let sizeBuffer = new ModernGpuBuffer(new Uint32Array([lifeSize, lifeSize]), 0, 0, ModernGpuBuffer.visibility.compute | ModernGpuBuffer.visibility.fragment, ModernGpuBuffer.bufferType.uniform, ModernGpuBuffer.usage.uniform);
    buffers.push(sizeBuffer);

    let start = new Uint32Array(lifeSize * lifeSize);
    for (let i = 0; i < lifeSize * lifeSize; i++) {
        start[i] = Math.random() > 0.5 ? 1 : 0;
    }
    let currentStateBuffer = new ModernGpuBuffer(start, 1, 0, ModernGpuBuffer.visibility.compute | ModernGpuBuffer.visibility.fragment, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copyDst);
    buffers.push(currentStateBuffer);

    let nextStateBuffer = new ModernGpuBuffer(new Uint32Array(lifeSize * lifeSize), 2, 0, ModernGpuBuffer.visibility.compute | ModernGpuBuffer.visibility.fragment, ModernGpuBuffer.bufferType.storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copySrc);
    buffers.push(nextStateBuffer);

    let kernel = new ComputeKernel(src, buffers, "main");
    let renderKernel = new RenderKernel(ctx, renderSrc, buffers, "vs_main", "fs_main", RenderKernel.topology.triangleStrip);

    for (let i = 0; i < 1000; i++) {
        kernel.run([lifeSize / 16, lifeSize / 16], [[nextStateBuffer, currentStateBuffer]]);
        renderKernel.run(4);

        await sleep(0.00001);
        console.log(i);
    }
}

main();

async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}