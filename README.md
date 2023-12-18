# Modern GPU

Modern GPU uses WebGPU underneath, but reorginized it in a much more understandable and usable way for most developers.

Right now WebGPU is only implemented on browsers, and this package currently only targets browsers. However, progress and efforts are being made to be able to interface with WebGPU's C++ library (DAWN) in Node. The next version of this package will include Node support as well when Node gains WebGPU support.

## Usage

ModernGPU is meant to simplify and automate most of the repeated parts of GPU configurations. This means you only have to worry about what data you are giving the GPU and programming your shader.

Data on the GPU is a buffer of one kind or another. ModernGPU lets you use any typed array that JS has to offer. However, it is up to you to match the type up in the shader program (int8 vs int 32 vs float32 etc.). GPU Buffers also need to know their binding number and group number. Binding number is basically what number argument the buffer is in the shader, and group number is basically what number shader it is being used on. When you get acclimated to WGSL, these will make sense.

ModernGPU exposes 4 main classes to control the GPU: ModernGpu, ModernGpuBuffer, ComputeKernel, and RenderKernel.

To create data that the GPU can use, make a ModernGpuBuffer. This class takes the typed array that it will initilize with data, the binding and group number, what shader stages it will be used in, the buffer type, and the buffer usage. After creation, these buffers get coppied (often called mapped) to the GPU and changing them will only change what the CPU sees. You can however, pass the bufferes between different kernels. Useful for things like running a simulation in a compute kernel, and rendering that state to the screen in a render kernel.

```javascript
let start = new Uint32Array(lifeSize * lifeSize);
for (let i = 0; i < lifeSize * lifeSize; i++) {
    start[i] = Math.random() > 0.5 ? 1 : 0;
}
// a buffer with binding 1, group 0, visible to compute and fragment shaders, read only, and used as storage and a copy destination (for writing to inbetween kernel runs).
let currentStateBuffer = new ModernGpuBuffer(start, 1, 0, ModernGpuBuffer.visibility.compute | ModernGpuBuffer.visibility.fragment, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copyDst);
```
```wgsl
@binding(1) @group(0) var<storage, read> current: array<u32>;
```

To pass data into the GPU from the CPU, make sure to give the usage parameter the ModernGpuBuffer.usage.copyDst value. This tells the gpu that the buffer must be stored somewhere that the CPU can send data to, and overwrite it if need be.

To get data into the CPU from the GPU, make sure to give the usage parameter the ModernGpuBuffer.usage.copySrc value (it is almost always accompanied by mapRead). This tells the GPU that the buffer must be kept in a place that the CPU can read the data in. WebGPU actually forbids any other usage with these two usages states, so it is common to make a bridge buffer that bridges GPU to CPU. The following is an example of a bridge buffer being used to read values from the GPU to the CPU.

```javascript
let currentBodiesBuffer = new ModernGpuBuffer(start, 2, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.read_only_storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copyDst);
buffers.push(currentBodiesBuffer);

let nextBodiesBuffer = new ModernGpuBuffer(new Float32Array(numberOfBodies * 6), 3, 0, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.storage, ModernGpuBuffer.usage.storage | ModernGpuBuffer.usage.copySrc);
buffers.push(nextBodiesBuffer);

let bridgeBuffer = new ModernGpuBuffer(new Float32Array(numberOfBodies * 6), undefined, undefined, ModernGpuBuffer.visibility.compute, ModernGpuBuffer.bufferType.storage, ModernGpuBuffer.usage.mapRead | ModernGpuBuffer.usage.copyDst);

let kernel = new ComputeKernel(src, buffers, "main");
kernel.run([numberOfBodies], [[nextBodiesBuffer, currentBodiesBuffer], [nextBodiesBuffer, bridgeBuffer]]);

let data = await bridgeBuffer.read();
```

Notice how the output (nexBodiesBuffer) has to be copied to the bridge buffer. Once the kernel has run and the data copied, we can use the ModernGpu.read() method to get the data out of the bridge buffer.

To create a shader program, load the program source file into a string (hard code it in JS or load it form a file it does not matter), and use the ComputeKernel or RenderKernel constructors. ModernGPU was designed with compute in mind, but it can render as well. However, this will not be well documented until it is better supported. Please take a look at the code if you want to use the render shader (it is not that scary I promise).

To make a compute shader, use the ComputeKernel and give it your source code string, buffers, and name of the entry point function (default is main). You can then run the kernel with the ComputeKernel.run() method which takes the number of workgroups and an array of ModernGpuBuffer pairs. The first argument is the number of work groups. The 3 values are the size of a 3d array describing how many cores you want to run your code. The cores are (abstractly thougth of as being) in a 3d array layout. So if your code inherently has some 1D, 2D, or 3D strucutre, you can take advantage of this. You should also keep in mind that WGSL will also have you specify the workgroup_size in the WGSL source code. These are not seperate cores, but how many SIMD operations one core can do. For example, if you want 100 tasks done, you can specify a number of work groups as (100,1,1) and workgroup_size as (1,1,1) and 100 cores will execute your shader. Or you can specify a number of work groups as (10,1,1) and workgroup_size as (10,1,1) and 10 cores will execute your code, each core doing 10 SIMD instructions. This is useful to know (and optimize for) if you have branches in your shader program. If one core is doing SIMD instructions and hits an if statemnt, it will have to do both branches seperatly, so try to make sure each workgroup takes the same branch of code. The second argument is the array of ModernGpuBuffer pairs. Each pair describes a copySrc, and copyDst buffer. Every copyDst buffer will have the data from the copySrc buffer copied into it at the end of the shader execution.

For good examples on how to get started with ModernGPU (or WebGPU in general) please see the ModernGPU/examples directory for a through list of examples using compute, render, both, and straight WebGPU with no library. The examples are common usecases and laid out in an learnable/teachable manner. https://github.com/Jman0519/ModernGPU/tree/master/tests

An example of optimizing for SIMD and workgoup size:
```wgsl
let index = global_id.x; // All 10 instances do this instruction at once
let counter = 0; // All 10 instances do this instruction at once
if(index < 9) { // All 10 instances check this at the same time, only 9 of them return true
    counter++; // Only 9 instances do this
    // Maybe some more expensive thing is done here instead of adding
}
else { // This is not skipped because 1 instance needs to do this too
    count--; // We basically did both branches of this if loop doubling the time it takes to execute this code
    // Maybe some more expensive thing is done here instead of adding
}
```