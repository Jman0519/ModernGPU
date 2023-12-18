import { ModernGpu, ModernGpuBuffer, RenderKernel } from "../../../ModernGPU.js";

async function main() {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    await ModernGpu.init();

    let src = await (await fetch("helloTriangle.wgsl")).text();

    let buffers = [];
    buffers.push(new ModernGpuBuffer(new Float32Array([
        -0.5, -0.5, // bottom left point of triangle
        0.0, 0.8, // top middle point of triangle
        0.5, -0.5 // bottom right point of triangle
    ]), 0, 0, ModernGpuBuffer.visibility.vertex, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage));

    let renderKernel = new RenderKernel(ctx, src, buffers);
    renderKernel.run(3);
}

main();