import { ModernGpu, ModernGpuBuffer, RenderKernel } from "../../../ModernGPU.js";

async function main() {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    await ModernGpu.init();

    let src = await (await fetch("mangoSquare.wgsl")).text();

    let buffers = [];
    buffers.push(new ModernGpuBuffer(new Float32Array([
        -1, -1, // bottom left
        -1, 1, // top left
        1, -1, // bottom right
        1, 1, // top right
    ]), 0, 0, ModernGpuBuffer.visibility.vertex, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage));

    let renderKernel = new RenderKernel(ctx, src, buffers, "vs_main", "fs_main", RenderKernel.topology.triangleStrip);
    renderKernel.run(4);
}

main();