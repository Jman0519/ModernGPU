import { ModernGpu, ModernGpuBuffer, ComputeKernel } from "../../../ModernGPU.js";

async function main() {
    let lifeSize = 2048;
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    document.body.append(canvas);
    canvas.width = lifeSize;
    canvas.height = lifeSize;
    let imageData = ctx.getImageData(0, 0, lifeSize, lifeSize);

    await ModernGpu.init();
    let gpu = new ModernGpu();

    let src = await (await fetch("gameOfLife.compute.wgsl")).text();

    let buffers = [];
    let sizeBuffer = new ModernGpuBuffer(new Uint32Array([lifeSize, lifeSize]), 0, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.uniform, ModernGpuBuffer.usage.uniform);
    buffers.push(sizeBuffer);

    let start = new Uint32Array(lifeSize * lifeSize);
    for (let i = 0; i < lifeSize * lifeSize; i++) {
        start[i] = Math.random() > 0.5 ? 1 : 0;
    }
    let currentStateBuffer = new ModernGpuBuffer(start, 1, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copyDst);
    buffers.push(currentStateBuffer);

    let nextStateBuffer = new ModernGpuBuffer(new Uint32Array(lifeSize * lifeSize), 2, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copySrc);
    buffers.push(nextStateBuffer);

    let bridgeBuffer = new ModernGpuBuffer(new Uint32Array(lifeSize * lifeSize), undefined, undefined, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.storage, ModernGpuBuffer.usage.mapRead | ModernGpuBuffer.usage.copyDst);

    let kernel = new ComputeKernel(src, buffers, "main");

    for (let i = 0; i < 1000; i++) {
        kernel.run([lifeSize / 16, lifeSize / 16], [[nextStateBuffer, currentStateBuffer], [nextStateBuffer, bridgeBuffer]]);

        let data = await bridgeBuffer.read();

        for (let i = 0; i < data.length; i++) {
            let alive = data[i];
            imageData.data[i * 4] = alive * 255;
            imageData.data[i * 4 + 1] = alive * 255;
            imageData.data[i * 4 + 2] = alive * 255;
            imageData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        // await sleep(0.01);
        console.log(i);
    }
}

main();

async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}