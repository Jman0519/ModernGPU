/**
* TypedArray
* @typedef {Int8Array|Int16Array|Int32Array|BigInt64Array|Uint8Array|Uint16Array|Uint32Array|BigUint64Array|Float32Array|Float64Array} TypedArray
*/

export class ModernGpu {
    /**
     * Empty constructor because getting a GPU is async. Make sure to call ModernGPU.init() instead.
     */
    constructor() { }

    /**
     * The GPU adapter
     * @type {GPUAdapter}
     */
    static adapter = undefined;

    /**
     * The GPU device
     * @type {GPUDevice}
     */
    static device = undefined;

    /**
     * Asks the machine for a high preformance GPU
     * @returns {ModernGpu}
     */
    static async init() {
        // get the gpu
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (adapter == null) {
            throw new Error("adapter is null");
        }
        ModernGpu.adapter = adapter;

        const device = await ModernGpu.adapter.requestDevice();
        if (device == null) {
            throw new Error("device is null");
        }
        ModernGpu.device = device;
    }

    /**
     * Example function to show how to use the gpu without library for reference of what this library does automatically.
     */
    static async Double() {
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

export class ModernGpuBuffer {
    static visibility = {
        vertex: GPUShaderStage.VERTEX,
        fragment: GPUShaderStage.FRAGMENT,
        compute: GPUShaderStage.COMPUTE,
    }

    static bufferType = {
        uniform: "uniform",
        storage: "storage",
        read_only_storage: "read-only-storage",
    }

    static usage = {
        mapRead: GPUBufferUsage.MAP_READ,
        mapWrite: GPUBufferUsage.MAP_WRITE,
        copySrc: GPUBufferUsage.COPY_SRC,
        copyDst: GPUBufferUsage.COPY_DST,
        index: GPUBufferUsage.INDEX,
        vertex: GPUBufferUsage.VERTEX,
        uniform: GPUBufferUsage.UNIFORM,
        storage: GPUBufferUsage.STORAGE,
        indirect: GPUBufferUsage.INDIRECT,
        queryResolve: GPUBufferUsage.QUERY_RESOLVE,
    }

    typedArray;
    binding;
    group;
    visibility;
    bufferType;
    usage;
    gpuBuffer;
    mutex = new Mutex();

    /**
     * Creates a ModernGpuBuffer.
     * @param {ModernGpuBufferOptions} options
     */
    constructor(typedArray, binding, group = 0, visibility = ModernGpuBuffer.visibility.compute, bufferType = ModernGpuBuffer.bufferType.storage, usage = ModernGpuBuffer.usage.storage) {
        this.typedArray = typedArray;
        this.binding = binding;
        this.group = group;
        this.visibility = visibility;
        this.bufferType = bufferType;
        this.usage = usage;

        this.gpuBuffer = ModernGpu.device.createBuffer({
            size: this.typedArray.byteLength,
            usage: this.usage,
            mappedAtCreation: true,
        });

        new this.typedArray.constructor(this.gpuBuffer.getMappedRange()).set(this.typedArray);
        this.gpuBuffer.unmap();
    }

    /**
    * Reads the data from the GPU to the CPU. Requires the buffer to be created with ModernGpu.usage.copySrc
    * @returns { Promise<TypedArray>}
    */
    async read() {
        await this.gpuBuffer.mapAsync(GPUMapMode.READ, 0, this.size); // this needs to have usage.mapRead to use
        const copyArrayBuffer = this.gpuBuffer.getMappedRange(0, this.size);
        this.typedArray = new this.typedArray.constructor(copyArrayBuffer.slice(0)); // TODO: does this need .slice(0)?
        this.gpuBuffer.unmap();
        return this.typedArray;
    }

    /**
    * Writes the data to the GPU. Requires the buffer to be created with ModernGpu.usage.copyDst
    * @param {TypedArray} typedArray 
    */
    write(typedArray) {
        if (typedArray.byteLength > this.size) {
            throw new Error("data is too large for buffer");
        }
        this.typedArray = typedArray;
        ModernGpu.device.queue.writeBuffer(this.buffer, 0, this.typedArray); // this needs to have usage.copyDst
    }
}

export class ComputeKernel {
    /**
     * Creates a ComputeKernel with the given GPU buffers and shader code. Can be run with ComputeKernel.run()
     * @param {GPUDevice} device 
     * @param {GPUComputePipeline} computePipeline 
     * @param {GPUBindGroup} bindGroup 
     * @param {Number[]} numWorkgroups 
     * @param {OutputBuffer[]} outputBuffers 
     */
    constructor(srcCode, buffers, entryPoint = "main") {
        // compile the shader code into spir-v or something
        const computeShader = ModernGpu.device.createShaderModule({
            code: srcCode
        });

        // make a list of the entries for the unifrom buffers
        const bufferLayoutEntries = [];
        for (let i = 0; i < buffers.length; i++) {
            const entry = {
                binding: buffers[i].binding,
                visibility: buffers[i].visibility,
                buffer: {
                    type: buffers[i].bufferType
                }
            };
            bufferLayoutEntries.push(entry);
        }

        const bindGroupLayout = ModernGpu.device.createBindGroupLayout({
            entries: bufferLayoutEntries
        });

        // make a list of the entries for the uniform buffers
        const bufferEntries = [];
        for (let i = 0; i < buffers.length; i++) {
            const entry = {
                binding: buffers[i].binding,
                resource: {
                    buffer: buffers[i].gpuBuffer
                }
            };
            bufferEntries.push(entry);
        }

        const bindGroup = ModernGpu.device.createBindGroup({
            layout: bindGroupLayout,
            entries: bufferEntries
        });

        const pipelineLayout = ModernGpu.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
        const computePipeline = ModernGpu.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: computeShader,
                entryPoint: entryPoint
            }
        });

        this.computePipeline = computePipeline;
        this.bindGroup = bindGroup;
    }
    computePipeline;
    bindGroup;

    /**
     * Runs the ComputeKernel. Optional flag to copy any OutputBuffers from the GPU to the CPU (set to false for speed).
     * @param {Boolean} copyToOutput Optional flag to copy any OutputBuffers from the GPU to the CPU (set to false for speed).
     * @param {StorageBuffer[][]} copyBufferPairs Optional list of StorageBuffer pairs specifiying a copy src, and copy dest pair.
     */
    run(workgroupSize, copyBufferPairs = []) {
        const commandEncoder = ModernGpu.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.computePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupSize[0] | 1, workgroupSize[1] | 1, workgroupSize[2] | 1);
        passEncoder.end();

        if (copyBufferPairs.length > 0) {
            for (const copyBufferPair of copyBufferPairs) {
                commandEncoder.copyBufferToBuffer(copyBufferPair[0].gpuBuffer, 0, copyBufferPair[1].gpuBuffer, 0, copyBufferPair[0].typedArray.byteLength);
            }
        }
        const commandBuffer = commandEncoder.finish();
        ModernGpu.device.queue.submit([commandBuffer]);
    }
}

export class RenderKernel {
    static topology = {
        pointList: "point-list",
        lineList: "line-list",
        lineStrip: "line-strip",
        triangleList: "triangle-list",
        triangleStrip: "triangle-strip",
    }

    /**
     * Creates a RenderKernel and displays the given StorageBuffer to the given canvas.
     * @param {GPUDevice} device 
     * @param {GPURenderPipeline} pipeline 
     * @param {GPUBindGroup} bindGroup 
     * @param {GPUCanvasContext} context
     * @param {Number} numberOfVertexShaders
     * @param {OutputBuffer[]} outputBuffers
     */
    constructor(context, srcCode, buffers, vertexEntryPoint = "vs_main", fragmentEntryPoint = "fs_main", topology = "triangle-list") {
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: ModernGpu.device,
            format: format
        });

        // compile the shader code into spir-v or something
        const renderShader = ModernGpu.device.createShaderModule({
            code: srcCode
        });

        // make a list of the entries for the unifrom buffers
        const bufferLayoutEntries = [];
        for (let i = 0; i < buffers.length; i++) {
            const entry = {
                binding: buffers[i].binding,
                visibility: buffers[i].visibility,
                buffer: {
                    type: buffers[i].bufferType
                }
            };
            bufferLayoutEntries.push(entry);
        }

        const bindGroupLayout = ModernGpu.device.createBindGroupLayout({
            entries: bufferLayoutEntries
        });

        // make a list of the entries for the uniform buffers
        const bufferEntries = [];
        for (let i = 0; i < buffers.length; i++) {
            const entry = {
                binding: buffers[i].binding,
                resource: {
                    buffer: buffers[i].gpuBuffer
                }
            };
            bufferEntries.push(entry);
        }

        const bindGroup = ModernGpu.device.createBindGroup({
            layout: bindGroupLayout,
            entries: bufferEntries
        });

        const pipelineLayout = ModernGpu.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

        const pipeline = ModernGpu.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: ModernGpu.device.createShaderModule({
                    code: srcCode
                }),
                entryPoint: vertexEntryPoint,
            },
            fragment: {
                module: ModernGpu.device.createShaderModule({
                    code: srcCode
                }),
                entryPoint: fragmentEntryPoint,
                targets: [{
                    format: format
                }]
            },
            primitive: {
                topology: topology
            },
        });

        this.pipeline = pipeline;
        this.bindGroup = bindGroup;
        this.context = context;
    }
    pipeline;
    bindGroup;
    context;

    /**
     * Displays the StorageBuffer to the canvas.
     */
    run(numberOfVertexShaders) {
        const commandEncoder = ModernGpu.device.createCommandEncoder();
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
        passEncoder.draw(numberOfVertexShaders);
        passEncoder.end();
        const commandBuffer = commandEncoder.finish();
        ModernGpu.device.queue.submit([commandBuffer]);
    }
}

class Mutex {
    promise = undefined;

    lock() {
        this.isLocked = true;
        this.promise = new Promise((resolve) => {
            this.unlock = resolve;
        });
    }

    unlock() { };
}
