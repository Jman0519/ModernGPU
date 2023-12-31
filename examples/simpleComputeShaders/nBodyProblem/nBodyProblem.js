import { ModernGpu, ModernGpuBuffer, ComputeKernel } from "../../../ModernGPU.js";

async function main() {
    let numberOfBodies = 256;
    let gravitationConstant = 6.67408e-11;
    let dt = 0.01;
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    document.body.append(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    await ModernGpu.init();

    let src = await (await fetch("nBodyProblem.compute.wgsl")).text();

    let buffers = [];
    let constantsBuffer = new ModernGpuBuffer(new Float32Array([gravitationConstant, dt]), 0, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.uniform, ModernGpuBuffer.usage.uniform);
    let numBodiesBuffer = new ModernGpuBuffer(new Uint32Array([numberOfBodies]), 1, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.uniform, ModernGpuBuffer.usage.uniform);
    buffers.push(constantsBuffer);
    buffers.push(numBodiesBuffer);

    let start = new Float32Array(numberOfBodies * 6);
    let avgSpeed = 50;
    for (let i = 0; i < numberOfBodies; i++) {
        start[i * 6] = Math.random() * canvas.width; // x
        start[i * 6 + 1] = Math.random() * canvas.height; // y
        start[i * 6 + 2] = (Math.random() * avgSpeed) - (avgSpeed / 2); // velocity x
        start[i * 6 + 3] = (Math.random() * avgSpeed) - avgSpeed / 2; // velocity y
        start[i * 6 + 4] = 10000 + (Math.random() * 100000); // mass
        start[i * 6 + 5] = Math.sqrt(start[i * 6 + 4]) / 100; // radius
    }

    let mass = 100000000;
    avgSpeed = 5;
    start[0] = canvas.width / 2 + 100; // x
    start[1] = canvas.height / 2 + 100; // y
    start[2] = avgSpeed; // velocity x
    start[3] = -avgSpeed; // velocity y
    start[4] = mass;
    start[5] = Math.sqrt(start[4]) / 1000; // radius

    start[6] = canvas.width / 2 + 100; // x
    start[7] = canvas.height / 2 - 100; // y
    start[8] = -avgSpeed; // velocity x
    start[9] = -avgSpeed; // velocity y
    start[10] = mass;
    start[11] = Math.sqrt(start[10]) / 1000; // radius

    start[12] = canvas.width / 2 - 100; // x
    start[13] = canvas.height / 2 - 100; // y
    start[14] = -avgSpeed; // velocity x
    start[15] = avgSpeed; // velocity y
    start[16] = mass;
    start[17] = Math.sqrt(start[16]) / 1000; // radius

    start[18] = canvas.width / 2 - 100; // x
    start[19] = canvas.height / 2 + 100; // y
    start[20] = avgSpeed; // velocity x
    start[21] = avgSpeed; // velocity y
    start[22] = mass;
    start[23] = Math.sqrt(start[22]) / 1000; // radius

    let currentBodiesBuffer = new ModernGpuBuffer(start, 2, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copyDst);
    buffers.push(currentBodiesBuffer);

    let nextBodiesBuffer = new ModernGpuBuffer(new Float32Array(numberOfBodies * 6), 3, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copySrc);
    buffers.push(nextBodiesBuffer);

    let bridgeBuffer = new ModernGpuBuffer(new Float32Array(numberOfBodies * 6), undefined, undefined, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.storage, ModernGpuBuffer.usage.mapRead | ModernGpuBuffer.usage.copyDst);

    let kernel = new ComputeKernel(src, buffers, "main");

    for (let i = 0; i < 100000; i++) {
        kernel.run([numberOfBodies], [[nextBodiesBuffer, currentBodiesBuffer], [nextBodiesBuffer, bridgeBuffer]]);

        let data = await bridgeBuffer.read();

        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "black";
        ctx.fill();

        for (let i = 0; i < data.length; i += 6) {
            let x = data[i];
            let y = data[i + 1];
            let radius = data[i + 5];
            ctx.beginPath();
            ctx.fillStyle = "white";
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.fill();
        }
        // await sleep(0.01);
        console.log(i);
    }
}

main();

async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}