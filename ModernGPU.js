/**
* TypedArray
* @typedef {Int8Array|Int16Array|Int32Array|BigInt64Array|Uint8Array|Uint16Array|Uint32Array|BigUint64Array|Float32Array|Float64Array} TypedArray
*/

/**
 * Provides a global namespace for ModernGPU.js variables
 */
export class ModernGpu {
    /**
     * Empty constructor because getting a GPU is async. Make sure to call ModernGPU.init() instead.
     * @hideconstructor
     */
    constructor() { }

    /**
     * The GPU adapter
     * @type {GPUAdapter}
     */
    static adapter;

    /**
     * The GPU device
     * @type {GPUDevice}
     */
    static device;

    /**
     * Initializes the GPU. Must be called before using any other functions.
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
}

export class ModernGpuBuffer {
    /**
     * @readonly
     * @enum {Number}
     */
    static visibility = {
        vertex: GPUShaderStage.VERTEX,
        fragment: GPUShaderStage.FRAGMENT,
        compute: GPUShaderStage.COMPUTE,
    }

    /**
     * @readonly
     * @enum {String}
     */
    static bufferType = {
        uniform: "uniform",
        storage: "storage",
        read_only_storage: "read-only-storage",
    }

    /**
     * @readonly
     * @enum {Number}
     */
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

    /**
    * @type {TypedArray}
    */
    typedArray;

    /**
     * @type {Number}
     */
    binding;

    /**
     * @type {Number}
     */
    group;

    /**
     * @type {visibility}
     */
    visibility;

    /**
     * @type {bufferType}
     */
    bufferType;

    /**
     * @type {usage}
     */
    usage;

    /**
     * @type {GPUBuffer}
     */
    gpuBuffer;

    /**
     * Creates a ModernGpuBuffer.
     * @param {TypedArray} typedArray The data to initilize the buffer with.
     * @param {Number} binding The binding number for the buffer.
     * @param {Number} [group] The group number for the buffer.
     * @param {visibility} [visibility] The shader stages allowed to access the buffer.
     * @param {bufferType} [bufferType] The type of buffer.
     * @param {usage} [usage] The usage of the buffer.
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
        await this.gpuBuffer.mapAsync(GPUMapMode.READ, 0, this.typedArray.byteLength); // this needs to have usage.mapRead to use
        const copyArrayBuffer = this.gpuBuffer.getMappedRange(0, this.typedArray.byteLength);
        this.typedArray = new this.typedArray.constructor(copyArrayBuffer.slice(0)); // TODO: does this need .slice(0)?
        this.gpuBuffer.unmap();
        return this.typedArray;
    }

    /**
    * Writes the data to the GPU. Requires the buffer to be created with ModernGpu.usage.copyDst
    * @param {TypedArray} typedArray 
    */
    write(typedArray) {
        if (typedArray.byteLength > this.typedArray.byteLength) {
            throw new Error("data is too large for buffer");
        }
        this.typedArray = typedArray;
        ModernGpu.device.queue.writeBuffer(this.gpuBuffer, 0, this.typedArray); // this needs to have usage.copyDst
    }
}

export class ComputeKernel {
    /**
     * Creates a ComputeKernel with the given GPU buffers and shader code. Can be run with ComputeKernel.run()
     * @param {String} srcCode The shader code.
     * @param {ModernGpuBuffer[]} buffers The GPU buffers.
     * @param {String} [entryPoint] The entry point for the shader.
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
     * @param {Number[]} workgroupSize The size of the workgroup to run.
     * @param {ModernGpuBuffer[][]} [copyBufferPairs] A list of pairs of buffers to copy from the first to the second.
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
    /**
     * @readonly
     * @enum {String}
     */
    static topology = {
        pointList: "point-list",
        lineList: "line-list",
        lineStrip: "line-strip",
        triangleList: "triangle-list",
        triangleStrip: "triangle-strip",
    }

    /**
     * Creates a RenderKernel and displays the given StorageBuffer to the given canvas.
     * @param {GPUCanvasContext} context The canvas to display the StorageBuffer to.
     * @param {String} srcCode The shader code.
     * @param {ModernGpuBuffer[]} buffers The GPU buffers.
     * @param {String} [vertexEntryPoint] The entry point for the vertex shader.
     * @param {String} [fragmentEntryPoint] The entry point for the fragment shader.
     * @param {topology} [topology] The topology for the render pipeline.
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
     * @param {Number} numberOfVertexShaders The number of vertex shaders to run.
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