import { ModernGpu } from "../../../ModernGPU.js";

async function main() {
    let lifeSize = 2048;
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    document.body.append(canvas);
    canvas.width = lifeSize;
    canvas.height = lifeSize;
    let imageData = ctx.getImageData(0, 0, lifeSize, lifeSize);

    let gpu = await ModernGpu.init();

    let src = await (await fetch("gameOfLife.compute.wgsl")).text();

    let storageBuffers = [];
    storageBuffers.push(gpu.createStorageBuffer(new Uint32Array([lifeSize, lifeSize]), 0));

    let inputBuffers = [];
    let start = new Uint32Array(lifeSize * lifeSize);
    for (let i = 0; i < lifeSize * lifeSize; i++) {
        start[i] = Math.random() > 0.5 ? 1 : 0;
    }
    inputBuffers.push(gpu.createInputBuffer(start, 1));

    let outputBuffers = [];
    outputBuffers.push(gpu.createOutputBuffer(new Uint32Array(lifeSize * lifeSize), 2));

    let kernel = gpu.compileComputeShader(src, storageBuffers, inputBuffers, outputBuffers, [lifeSize / 16, lifeSize / 16], "main");

    for (let i = 0; i < 1000; i++) {
        kernel.run(true);

        let data = await outputBuffers[0].read();
        inputBuffers[0].write(data);

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