# Modern GPU

Modern GPU uses WebGPU underneath, but reorginized it in a much more understandable and usable way for most developers.

Right now WebGPU is only implemented on most browsers, and this package currently only targets browsers. However, progress and efforts are being made to be able to interface with WebGPU's C++ library (DAWN) in Node. The next version of this package will include Node support as well.

## Usage

ModernGPU is meant to simplify and automate most of the repeated parts of GPU configurations. This means you only have to worry about what data you are giving the GPU and programming your shader.

Data on the GPU is a buffer of one kind or another. ModernGPU lets you use any typed buffer/array that JS has to offer. However, it is up to you to match the type up in the shader program (int8 vs int 32 vs float). GPU Buffers also need to know their binding number and workgroup number. Binding number is basically what number argument the buffer is in the shader, and workgroup number is basically what number shader it is being used on. If/When you get aclimated to WGSL, these will make sense.

ModernGPU exposes 3 functions/factories for making GPU buffers: createStorageBuffer, createUniformBuffer, and createOutputBuffer.

To create data that the GPU can use, use the ModernGPU.createStorageBuffer() method. This method will take a buffer of data (and binding number and workgroup number), and move all the data to the GPU for it to use while running programs. These are buffers that stay on the GPU only. You can pass them between shaders and change them and their changes will persist between function calls. Useful for things like starting a simulation with some state, and letting the GPU keep track of the state from there on out.

```javascript
let pointBuffer = gpu.createStorageBuffer(new Float32Array(pointCloud.points.flat()), 0);
let colorBuffer = gpu.createStorageBuffer(new Uint32Array(pointCloud.colors.flat()), 3);
// cannot do much with them after they are written to

```

To pass data into the GPU from the CPU, use the ModerGPU.createUniformBuffer() method. This method will take a buffer of data (and binding number and workgroup number), and make a one way (CPU to GPU) stream of data. This kind of buffer is useful for giving data to a shader program (think where is the camera, where is the center of some more complex object). You want to keep these buffers as small as possible. If you can describe an object - say verticies of a box - with a storage buffer, but the only parts the change is its center, only make the center a uniform buffer.

```javascript
let inputBuffer = gpu.createUniformBuffer(
    new Float32Array(
        [camera.x, camera.y, camera.z, ...camera.GetRotationMatrix().data.flat(), camera.pointRadius, camera.fc, camera.fov, pc.points.length, canvas.width, canvas.height]
        ),
    1);
//start the kernel program and run it in some loop
while(true)
{
    inputBuffer.write(new Float32Array(
        [camera.x, camera.y, camera.z, ...camera.GetRotationMatrix().data.flat(), camera.pointRadius, camera.fc, camera.fov, pc.points.length, canvas.width, canvas.height]
    ))
    //kernel.run Some 3d Camera viewer
}

```

To get data out of the GPU and into the CPU, use the ModernGPU.createOutputBuffer() method. This method will take a buffer of data (and binding number and workgroup number), and make a oneway (GPU to CPU) stream of data. This kind of buffer is useful for getting the results of a shader program. Again, you want to keep these buffers as small as possible.

```javascript
let outputBuffer = gpu.createOutputBuffer(new Float32Array(1), 2);
// start the kernel program and run it in some loop
while(true)
{
    //kernel.run Game of Life
    let numberCellsAlive = await outputBuffer.read();
}
```

To create a shader program, load the program source file into a string (hard code it in JS or load it form a file it does not matter), and use the ModernGPU.compileComputeShader() or ModernGPU.compileRenderShader(). ModernGPU was designed with compute in mind, but it can render as well. However, this will not be documented until it is better supported. Please take a look at the code if you want to use the render shader, it is not that scary.

To make a compute shader, use the ModernGPU.compileComputeShader() and give it your source code string, storageBuffers, uniform (input) buffers, outputBuffers, and number of workgroups. Optionally you can provide it an entry point in the shader function, but it defaults to "main". The number of work groups should be a 3d array describing how many cores you want to run your code. The cores are (abstractly thougth of as being) in a 3d array layout. So if your code inherently has some 1D, 2D, or 3D strucutre, you can take advantage of this. You should also keep in mind that WGSL will also have you specify the workgroup_size in the WGSL source code. These are not seperate cores, but how many SIMD operations one core can do. For example, if you want 100 tasks done, you can specify a number of work groups as (100,1,1) and workgroup_size as (1,1,1) and 100 cores will execute your shader. Or you can specify a number of work groups as (10,1,1) and workgroup_size as (10,1,1) and 10 cores will execute your code, each core doing 10 SIMD instructions. This is useful to know (and optimize for) if you have branches in your shader program. If one core is doing SIMD instructions and hits an if statemnt, it will have to do both branches seperatly, so try to make sure each workgroup takes the same branch of code.

```javascript
    let pointBuffer = gpu.createStorageBuffer(new Float32Array(pc.points.flat()), 0);
    let colorBuffer = gpu.createStorageBuffer(new Uint32Array(pc.colors.flat()), 3);
    let inputBuffer = gpu.createUniformBuffer(new Float32Array([camera.x, camera.y, camera.z, ...camera.GetRotationMatrix().data.flat(), camera.pointRadius, camera.fc, camera.fov, pc.points.length, canvas.width, canvas.height]), 1);
    let outputBuffer = gpu.createOutputBuffer(new Float32Array(canvas.width * canvas.height * 4), 2);

    // write the source code
    const numWorkgroups = [Math.ceil((pc.points.length) / 256), 1, 1];
    const srcCode = `
    struct inputs {
        x: f32,
        y: f32,
        z: f32,
        rot00: f32,
        rot01: f32,
        rot02: f32,
        rot10: f32,
        rot11: f32,
        rot12: f32,
        rot20: f32,
        rot21: f32,
        rot22: f32,
        pointRadius: f32,
        fc: f32,
        fov: f32,
        numPoints: f32,
        width: f32,
        height: f32
    }
        @group(0) @binding(0) var<storage, read_write> xin: array<f32>;
        @group(0) @binding(3) var<storage, read_write> color: array<u32>;
        @group(0) @binding(1) var<uniform> input: inputs;
        @group(0) @binding(2) var<storage, read_write> xout: array<f32>;
        @compute @workgroup_size(256, 1, 1)
        fn main(
            @builtin(global_invocation_id)
            global_id: vec3u
        ){
            let index = global_id.x;
            if (f32(index) >= input.numPoints) {
                return;
            }
            let x = xin[index * 3];
            let y = xin[index * 3 + 1];
            let z = xin[index * 3 + 2];
            let rot = mat3x3<f32>(
                input.rot00, input.rot10, input.rot20,
                input.rot01, input.rot11, input.rot21,
                input.rot02, input.rot12, input.rot22,
            );
            let translated = vec3<f32>(x - input.x, y - input.y, z - input.z);
            let rotated = rot * translated;
            let scaleFactor = input.fc / rotated.x;

            if(rotated.x < 0) {
                return;
            }

            let screenPos = vec3<f32>(
            (-rotated.y * scaleFactor) + (input.width / 2),
            (-rotated.z * scaleFactor) + (input.height / 2),
            input.fc);

            if(screenPos.x > input.width || screenPos.x < 0 || screenPos.y > input.height || screenPos.y < 0) {
                return;
            }
            let pix = u32(floor(screenPos.x)) + u32(floor(screenPos.y)) * u32(input.width);
            var depth = rotated.x;

            if (pix >= u32(input.width * input.height) || pix < 0) {
                return;
            }

            // xout[pix * 4] = depth;
            // xout[pix * 4 + 1] = depth;
            // xout[pix * 4 + 2] = depth;
            // xout[pix * 4 + 3] = f32(255);

            xout[pix * 4] = f32(color[index*3]);
            xout[pix * 4 + 1] = f32(color[index*3+1]);
            xout[pix * 4 + 2] = f32(color[index*3+2]);
            xout[pix * 4 + 3] = f32(255);
        }
        `
    const clearBackgroundCode = `
        @group(0) @binding(2) var<storage, read_write> xout: array<f32>;
        @compute @workgroup_size(256, 1, 1)
        fn main(
            @builtin(global_invocation_id)
            global_id: vec3u
        ){
            let index = global_id.x;
            xout[index * 4] = f32(18);
            xout[index * 4 + 1] = f32(18);
            xout[index * 4 + 2] = f32(18);
            xout[index * 4 + 3] = f32(255);
        }
    `

    let kernel = gpu.compileComputeShader(srcCode, [pointBuffer, colorBuffer], [inputBuffer], [outputBuffer], numWorkgroups);
    let backgroundKernel = gpu.compileComputeShader(clearBackgroundCode, [], [], [outputBuffer], [Math.ceil((canvas.width * canvas.height) / 256), 1, 1]);
    let renderKernel = gpu.compileRenderShader(ctx, outputBuffer, [canvas.width, canvas.height]);

    backgroundKernel.run();
    kernel.run();
    renderKernel.run();
    const result = await outputBuffer.read(); // note that this output buffer does not need to be an output buffer exepct for this read. It could be a storageBuffer.
```

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