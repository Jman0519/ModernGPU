import { ModernGpu, ModernGpuBuffer, RenderKernel } from "../../../ModernGPU.js";

async function main() {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("webgpu");
    document.body.append(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    await ModernGpu.init();

    let src = await (await fetch("circle.wgsl")).text();

    let buffers = [];
    let verticies = [
        -1, -1, // bottom left
        -1, 1, // top left
        1, -1, // bottom right
        1, 1, // top right
    ]
    buffers.push(new ModernGpuBuffer(new Float32Array(verticies), 0, 0, ModernGpuBuffer.visibility.vertex | ModernGpuBuffer.visibility.fragment, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage));

    let renderShader = new RenderKernel(ctx, src, buffers, "vr_main", "fr_main", RenderKernel.topology.triangleStrip);
    renderShader.run(4);
}

main();