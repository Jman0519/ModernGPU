perfTest();

async function perfTest() {
    let countNumber = 100;

    let x = [];
    for (let i = 0; i < 1e6; i++) {
        x[i] = i;
    }
    let xCpu = x.slice();
    let xCpuOut = new Float32Array(x.length);
    let xMap = x.slice();
    let xMapOut = new Float32Array(x.length);
    let xGpu = new Float32Array(x);

    console.time("cpu time");
    for (let count = 0; count < countNumber; count++) {
        for (let i = 0; i < xCpu.length; i++) {
            xCpuOut[i] = Math.sqrt(xCpu[i]);
        }
    }
    console.log(xCpuOut.slice(0, 10));
    console.timeEnd("cpu time");
    console.time("map time");
    for (let count = 0; count < countNumber; count++) {
        xMapOut = xMap.map((x) => Math.sqrt(x));
    }
    console.log(xMapOut.slice(0, 10));
    console.timeEnd("map time");
    console.time("gpu time create, run, and read");
    // get the gpu
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (adapter == null) {
        throw new Error("adapter is null");
    }
    const device = await adapter.requestDevice();
    if (device == null) {
        throw new Error("device is null");
    }

    // define the shader code
    const computeCode = `
        @group(0) @binding(0) var<storage, read_write> xout: array<f32>;
        @group(0) @binding(1) var<storage, read> xin: array<f32>;
        @group(0) @binding(2) var<uniform> mul: f32;
        @compute @workgroup_size(256, 1, 1)
        fn main(
            @builtin(global_invocation_id)
            global_id: vec3u,

            @builtin(local_invocation_id)
            local_id: vec3u,
        ){
            var index: u32 = global_id.x + (global_id.y * 16);
            xout[index] = sqrt(xin[index]);// * mul;
        }
        `;
    // compile the shader code into spir-v or something
    const computeShader = device.createShaderModule({
        code: computeCode
    });
    // create an object which can take cpu memory, and map it to GPU memory
    const xout = device.createBuffer({
        size: xGpu.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const xin = device.createBuffer({
        size: xGpu.byteLength,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: true,
    });
    new Float32Array(xin.getMappedRange()).set(xGpu);
    xin.unmap();
    const mul = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(mul.getMappedRange()).set([1]);
    mul.unmap();
    const bufferOut = device.createBuffer({
        size: xGpu.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    // tell the gpu that this is how memory will be structured (becuase it cant for some reason figure it out on its own)
    const bindGroupLayoutCompute = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage",
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "read-only-storage",
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform",
                }
            }
        ]
    });
    // tell the gpu where the memory for each variable is located
    const bindGroup = device.createBindGroup({
        layout: bindGroupLayoutCompute,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: xout
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: xin
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: mul
                }
            }
        ]
    });
    // tell the gpu what order to run the shaders
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayoutCompute] });
    // the the gpu where to enter the shader code, along with some hard coded constants?
    const computePipeline = device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
            module: computeShader,
            entryPoint: "main"
        }
    });
    console.time("gpu time run and read");
    console.time("gpu time run");
    for (let count = 0; count < countNumber; count++) {
        device.queue.writeBuffer(mul, 0, new Float32Array([1]));
        // tell the gpu we are done setting up its program
        let commandEncoder = device.createCommandEncoder();
        // tell the gpu to run the program
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(65535, 1, 1);
        passEncoder.end();
        // tell the gpu to copy data between these buffers
        commandEncoder.copyBufferToBuffer(xout, 0, bufferOut, 0, xGpu.byteLength);
        // tell the gpu we are done giving it commands
        const commandBuffer = commandEncoder.finish();
        // run the gpu program
        device.queue.submit([commandBuffer]);
    }
    console.timeEnd("gpu time run");
    console.time("gpu time read");
    // copy the output buffer from the gpu to the cpu
    await bufferOut.mapAsync(GPUMapMode.READ, 0, xGpu.byteLength);
    // copy the output buffer from a gpu object to an array buffer
    const copyArrayBuffer = bufferOut.getMappedRange(0, xGpu.byteLength); // this is the copy that takes the most time and is size dependent
    console.timeEnd("gpu time read");
    const data = new Float32Array(copyArrayBuffer.slice(0));
    bufferOut.unmap();
    console.log(data.slice(0, 10));
    console.timeEnd("gpu time run and read");
    console.timeEnd("gpu time create, run, and read");
}