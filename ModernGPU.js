export class ModernGpu {
    constructor() { }

    adapter = undefined;
    device = undefined;

    static async init() {
        const gpu = new ModernGpu();

        // get the gpu
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (adapter == null) {
            throw new Error("adapter is null");
        }
        gpu.adapter = adapter;

        const device = await gpu.adapter.requestDevice();
        if (device == null) {
            throw new Error("device is null");
        }
        gpu.device = device;

        return gpu;
    }

    createStorageBuffer(buffer, binding, group = 0) {
        if (this.device == undefined) {
            throw new Error("device is undefined");
        }

        const storageBuffer = this.device.createBuffer({
            size: buffer.byteLength,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });

        new buffer.constructor(storageBuffer.getMappedRange()).set(buffer);
        storageBuffer.unmap();
        return new StorageBuffer(storageBuffer, binding, group);
    }

    createUniformBuffer(buffer, binding, group = 0) {
        if (this.device == undefined) {
            throw new Error("device is undefined");
        }

        const uniformBuffer = this.device.createBuffer({
            size: buffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        new buffer.constructor(uniformBuffer.getMappedRange()).set(buffer);
        uniformBuffer.unmap();
        return new UniformBuffer(uniformBuffer, buffer, this.device, binding, group);
    }

    createOutputBuffer(buffer, binding, group = 0) {
        if (this.device == undefined) {
            throw new Error("device is undefined");
        }

        const gpuOnlyBuffer = this.device.createBuffer({
            size: buffer.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const cpuAndGpuBuffer = this.device.createBuffer({
            size: buffer.byteLength,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        return new OutputBuffer(gpuOnlyBuffer, cpuAndGpuBuffer, buffer, binding, group);
    }

    createTexture(binding, width, height, depth = 1, group = 0) {
        if (this.device == undefined) {
            throw new Error("device is undefined");
        }

        const texture = this.device.createTexture({
            size: [width, height, depth],
            format: "rgba8unorm",
            usage: GPUTextureUsage.STORAGE_BINDING
        });

        return new Texture(texture, binding, group);
    }

    createSampler(binding, group = 0) {
        if (this.device == undefined) {
            throw new Error("device is undefined");
        }

        const sampler = this.device.createSampler();
        return new Sampler(sampler, binding, group);
    }

    compileComputeShader(srcCode, storageBuffers, uniformBuffers, outputBuffers, numWorkgroups, entryPoint = "main") {
        if (this.device == undefined) {
            throw new Error("device is undefined");
        }

        // compile the shader code into spir-v or something
        const computeShader = this.device.createShaderModule({
            code: srcCode
        });

        // make a list of the entries for the storage buffers
        const storageBufferLayoutEntries = [];
        for (let i = 0; i < storageBuffers.length; i++) {
            let entry = {
                binding: storageBuffers[i].binding,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "storage"
                }
            };
            storageBufferLayoutEntries.push(entry);
        }

        // make a list of the entries for the uniform buffers
        const uniformBufferLayoutEntries = [];
        for (let i = 0; i < uniformBuffers.length; i++) {
            let entry = {
                binding: uniformBuffers[i].binding,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform"
                }
            };
            uniformBufferLayoutEntries.push(entry);
        }

        // make a list of the entries for the output buffers
        const outputBufferLayoutEntries = [];
        for (let i = 0; i < outputBuffers.length; i++) {
            let entry = {
                binding: outputBuffers[i].binding,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "storage"
                }
            };
            outputBufferLayoutEntries.push(entry);
        }

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                ...storageBufferLayoutEntries,
                ...uniformBufferLayoutEntries,
                ...outputBufferLayoutEntries
            ]
        });

        // make a list of the entries for the storage buffers
        const storageBufferEntries = [];
        for (let i = 0; i < storageBuffers.length; i++) {
            let entry = {
                binding: storageBuffers[i].binding,
                resource: {
                    buffer: storageBuffers[i].buffer
                }
            };
            storageBufferEntries.push(entry);
        }

        // make a list of the entries for the uniform buffers
        const uniformBufferEntries = [];
        for (let i = 0; i < uniformBuffers.length; i++) {
            let entry = {
                binding: uniformBuffers[i].binding,
                resource: {
                    buffer: uniformBuffers[i].buffer
                }
            };
            uniformBufferEntries.push(entry);
        }

        // make a list of the entries for the output buffers
        const outputBufferEntries = [];
        for (let i = 0; i < outputBuffers.length; i++) {
            let entry = {
                binding: outputBuffers[i].binding,
                resource: {
                    buffer: outputBuffers[i].buffer
                }
            };
            outputBufferEntries.push(entry);
        }

        const bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                ...storageBufferEntries,
                ...uniformBufferEntries,
                ...outputBufferEntries
            ]
        });

        const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
        const computePipeline = this.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: computeShader,
                entryPoint: entryPoint
            }
        });

        return new ComputeKernel(this.device, computePipeline, bindGroup, numWorkgroups, outputBuffers);
    }

    compileRenderShader(context, buffer, canvasSize) {
        if (this.device == undefined) {
            throw new Error("device is undefined");
        }

        const format = navigator.gpu.getPreferredCanvasFormat();

        context.configure({
            device: this.device,
            format: format
        });

        const basicRenderShader = `
        @group(${buffer.group}) @binding(${buffer.binding}) var<storage, read_write> buffer: array<f32>;
        const width: u32 = ${canvasSize[0]};
        const height: u32 = ${canvasSize[1]};

            struct VertexOutput {
                @builtin(position) Position : vec4<f32>,
                @location(0) fragUV : vec2<f32>,
            }

            @vertex
            fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
                const pos = array(
                    vec2( 1.0,  1.0),
                    vec2( 1.0, -1.0),
                    vec2(-1.0, -1.0),
                    vec2( 1.0,  1.0),
                    vec2(-1.0, -1.0),
                    vec2(-1.0,  1.0),
                );
            
                const uv = array(
                    vec2(1.0, 0.0),
                    vec2(1.0, 1.0),
                    vec2(0.0, 1.0),
                    vec2(1.0, 0.0),
                    vec2(0.0, 1.0),
                    vec2(0.0, 0.0),
                );
            
                var output : VertexOutput;
                output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
                output.fragUV = uv[VertexIndex];
                return output;
            }

            @fragment
            fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
                let pos = vec2<u32>(u32(fragUV.x * f32(width)), u32(fragUV.y * f32(height)));
                let index = pos.x + (pos.y * width);
                let size = arrayLength(&buffer);
                if (index < 0) {
                    return vec4<f32>(1.0, 1.0, 0.0, 1.0);
                }
                return vec4<f32>(buffer[(index * 4)]/255.0, buffer[(index * 4) + 1]/255.0, buffer[(index * 4) + 2]/255.0, buffer[(index * 4) + 3]/255.0);
            }
        `;

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: buffer.binding,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "storage"
                    }
                }
            ]
        });

        const bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: buffer.binding,
                    resource: {
                        buffer: buffer.buffer
                    }
                }
            ]
        });

        const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

        const pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: this.device.createShaderModule({
                    code: basicRenderShader
                }),
                entryPoint: "vert_main"
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: basicRenderShader
                }),
                entryPoint: "frag_main",
                targets: [{
                    format: format
                }]
            },
            primitive: {
                topology: "triangle-list"
            },
        });

        return new RenderKernel(this.device, pipeline, bindGroup, context);
    }

    async Double() {
        let x = [];
        for (let i = 0; i < 1e6; i++) {
            x[i] = i;
        }
        let xCpu = x.slice();
        let xMap = x.slice();
        let xGpu = new Float32Array(x); // x.slice();
        console.time("cpu double");
        for (let i = 0; i < xCpu.length; i++) {
            xCpu[i] = Math.sqrt(xCpu[i]);
        }
        console.log(xCpu.slice(0, 10));
        console.timeEnd("cpu double");
        console.time("map double");
        xMap = xMap.map((x) => Math.sqrt(x));
        console.log(xMap.slice(0, 10));
        console.timeEnd("map double");
        console.time("gpu double create and run");
        // get the gpu
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (adapter == null) {
            throw new Error("adapter is null");
        }
        const device = await adapter.requestDevice();
        if (device == null) {
            throw new Error("device is null");
        }
        console.log(device);
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
            xout[index] = xin[index] * mul;
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
        console.time("gpu double run and read");
        for (let i = 0; i < 2; i++) {
            console.time("gpu run");
            device.queue.writeBuffer(mul, 0, new Float32Array([i]));
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
            console.timeEnd("gpu run");
            console.time("gpu read");
            // copy the output buffer from the gpu to the cpu
            await bufferOut.mapAsync(GPUMapMode.READ, 0, xGpu.byteLength);
            // copy the output buffer from a gpu object to an array buffer
            const copyArrayBuffer = bufferOut.getMappedRange(0, xGpu.byteLength); // this is the copy that takes the most time and is size dependent
            console.timeEnd("gpu read");
            const data = new Float32Array(copyArrayBuffer.slice(0));
            bufferOut.unmap();
            console.log(data.slice());
        }
        console.timeEnd("gpu double run and read");
        console.timeEnd("gpu double create and run");
    }
}

class StorageBuffer {
    constructor(buffer, binding, group) {
        this.buffer = buffer;
        this.binding = binding;
        this.group = group;
    }
    buffer;
    binding;
    group;
}

class UniformBuffer {
    constructor(buffer, typedArrayBuffer, device, binding, group) {
        this.buffer = buffer;
        this.device = device;
        this.size = typedArrayBuffer.byteLength;
        this.binding = binding;
        this.group = group;
    }
    buffer;
    device;
    size;
    binding;
    group;
    write(data) {
        if (data.byteLength > this.size) {
            throw new Error("data is too large for buffer");
        }
        this.device.queue.writeBuffer(this.buffer, 0, data);
    }
}

class OutputBuffer {
    constructor(gpuBuffer, cpuAndGpuBuffer, buffer, binding, group) {
        this.buffer = gpuBuffer;
        this.cpuAndGpuBuffer = cpuAndGpuBuffer;
        this.size = buffer.byteLength;
        this.bufferConstructor = buffer.constructor;
        this.binding = binding;
        this.group = group;
        this.lastData = buffer;
        this.deferer.resolve();
    }
    buffer;
    cpuAndGpuBuffer;
    size;
    bufferConstructor;
    binding;
    group;
    reading = false;
    deferer = new Deferer();
    lastData;
    async read() {
        if (this.reading) {
            return this.lastData;
        }
        this.reading = true;
        this.deferer = new Deferer();
        await this.cpuAndGpuBuffer.mapAsync(GPUMapMode.READ, 0, this.size);
        const copyArrayBuffer = this.cpuAndGpuBuffer.getMappedRange(0, this.size);
        this.lastData = new this.bufferConstructor(copyArrayBuffer.slice(0));
        this.cpuAndGpuBuffer.unmap();
        this.reading = false;
        this.deferer.resolve();
        return this.lastData;
    }
}

class Texture {
    constructor(texture, binding, group) {
        this.texture = texture;
        this.binding = binding;
        this.group = group;
    }
    texture;
    binding;
    group;
}

class Sampler {
    constructor(sampler, binding, group) {
        this.sampler = sampler;
        this.binding = binding;
        this.group = group;
    }
    sampler;
    binding;
    group;
}

class ComputeKernel {
    constructor(device, computePipeline, bindGroup, numWorkgroups, outputBuffers) {
        this.device = device;
        this.computePipeline = computePipeline;
        this.bindGroup = bindGroup;
        this.numWorkgroups = numWorkgroups;
        this.outputBuffers = outputBuffers;
    }
    device;
    computePipeline;
    bindGroup;
    numWorkgroups;
    outputBuffers;
    async run(copyToOutput = true) {
        for (const outputBuffer of this.outputBuffers) {
            if (outputBuffer.reading) {
                await outputBuffer.deferer.promise;
            }
        }
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.computePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(this.numWorkgroups[0], this.numWorkgroups[1], this.numWorkgroups[2]);
        passEncoder.end();
        if (copyToOutput) {
            for (const outputBuffer of this.outputBuffers) {
                commandEncoder.copyBufferToBuffer(outputBuffer.buffer, 0, outputBuffer.cpuAndGpuBuffer, 0, outputBuffer.size);
            }
        }
        const commandBuffer = commandEncoder.finish();
        this.device.queue.submit([commandBuffer]);
    }
}

class RenderKernel {
    constructor(device, pipeline, bindGroup, context) {
        this.device = device;
        this.pipeline = pipeline;
        this.bindGroup = bindGroup;
        this.context = context;
    }
    device;
    pipeline;
    bindGroup;
    context;
    run() {
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.draw(6, 1, 0, 0);
        passEncoder.end();
        const commandBuffer = commandEncoder.finish();
        this.device.queue.submit([commandBuffer]);
    }
}

class Deferer {
    promise;
    resolve = () => { };
    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolve = resolve;
        });
    }
}