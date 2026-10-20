// Two ways to draw the character grid. Both take the frame's glyph indices
// (one byte per cell) and its RGBA pixels (one pixel per cell).
//
// WebGlRenderer: the 64 glyphs are drawn once into an atlas texture. Each
// frame uploads the indices and colours as two small textures and draws one
// full-screen triangle; the fragment shader looks up each cell's glyph and
// colour. One draw call, no per-cell JavaScript.
//
// Canvas2dRenderer: one fillText per cell. The fallback when WebGL2 is
// unavailable, and the baseline for comparison (?renderer=2d).

const ATLAS_COLUMNS = 8;

const VERTEX_SHADER = `#version 300 es
void main() {
    // One triangle that covers the screen: (-1,-1), (3,-1), (-1,3).
    vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
    gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D glyphIndex;  // R8UI, one texel per cell
uniform sampler2D cellColour;          // RGBA8, one texel per cell
uniform sampler2D atlas;               // glyphs, white on transparent
uniform ivec2 cellSize;                // device pixels
uniform int rows;
uniform bool mono;
uniform float fill;                    // cell background, as a fraction of its colour
uniform vec3 monoColour;
out vec4 colour;

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    pixel.y = rows * cellSize.y - 1 - pixel.y;       // top-left origin
    ivec2 cell = pixel / cellSize;
    ivec2 inCell = pixel - cell * cellSize;

    int glyph = int(texelFetch(glyphIndex, cell, 0).r);
    ivec2 atlasCell = ivec2(glyph % ${ATLAS_COLUMNS}, glyph / ${ATLAS_COLUMNS});
    float ink = texelFetch(atlas, atlasCell * cellSize + inCell, 0).a;

    vec3 tint = mono ? monoColour : texelFetch(cellColour, cell, 0).rgb;
    colour = vec4(mix(tint * fill, tint, ink), 1.0);
}`;

export class WebGlRenderer {
    static create(canvas) {
        const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
        return gl ? new WebGlRenderer(gl) : null;
    }

    constructor(gl) {
        this.name = 'webgl2';
        this.gl = gl;
        this.program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
        gl.useProgram(this.program);
        this.uniforms = {};
        for (const name of ['glyphIndex', 'cellColour', 'atlas', 'cellSize', 'rows', 'mono', 'monoColour', 'fill']) {
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        }
        gl.uniform1i(this.uniforms.glyphIndex, 0);
        gl.uniform1i(this.uniforms.cellColour, 1);
        gl.uniform1i(this.uniforms.atlas, 2);
        this.indexTexture = makeTexture(gl, 0);
        this.colourTexture = makeTexture(gl, 1);
        this.atlasTexture = makeTexture(gl, 2);
        gl.bindVertexArray(gl.createVertexArray());   // no attributes: gl_VertexID
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    }

    // Called when the grid or cell size changes.
    resize(grid) {
        const gl = this.gl;
        this.grid = grid;
        gl.viewport(0, 0, grid.columns * grid.cellWidth, grid.rows * grid.cellHeight);
        gl.uniform2i(this.uniforms.cellSize, grid.cellWidth, grid.cellHeight);
        gl.uniform1i(this.uniforms.rows, grid.rows);

        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, grid.columns, grid.rows, 0,
            gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
        gl.activeTexture(gl.TEXTURE1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, grid.columns, grid.rows, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.activeTexture(gl.TEXTURE2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawAtlas(grid));
    }

    draw(indices, rgba, mono, fill = 0) {
        const gl = this.gl;
        const { columns, rows } = this.grid;
        gl.activeTexture(gl.TEXTURE0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, columns, rows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, indices);
        if (!mono) {
            gl.activeTexture(gl.TEXTURE1);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, columns, rows, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        }
        gl.uniform1i(this.uniforms.mono, mono ? 1 : 0);
        gl.uniform1f(this.uniforms.fill, fill);
        gl.uniform3f(this.uniforms.monoColour, ...this.grid.monoColour);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    clear() {
        const gl = this.gl;
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}

export class Canvas2dRenderer {
    constructor(canvas) {
        this.name = 'canvas2d';
        this.ctx = canvas.getContext('2d');
    }

    resize(grid) {
        this.grid = grid;
    }

    draw(indices, rgba, mono, fill = 0) {
        const { ctx, grid } = this;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, grid.columns * grid.cellWidth, grid.rows * grid.cellHeight);
        ctx.font = `${grid.fontSize}px ${grid.fontFamily}`;
        ctx.textBaseline = 'top';
        if (mono) ctx.fillStyle = grid.monoCss;
        if (fill > 0) {
            for (let i = 0; i < grid.columns * grid.rows; i++) {
                const p = i * 4;
                const [r, g, b] = mono ? grid.monoColour.map(c => c * 255) : [rgba[p], rgba[p + 1], rgba[p + 2]];
                ctx.fillStyle = `rgb(${r * fill},${g * fill},${b * fill})`;
                ctx.fillRect((i % grid.columns) * grid.cellWidth, Math.floor(i / grid.columns) * grid.cellHeight,
                    grid.cellWidth, grid.cellHeight);
            }
            if (mono) ctx.fillStyle = grid.monoCss;
        }
        for (let row = 0, i = 0; row < grid.rows; row++) {
            const y = row * grid.cellHeight + grid.textTop;
            for (let col = 0; col < grid.columns; col++, i++) {
                if (!mono) {
                    const p = i * 4;
                    ctx.fillStyle = `rgb(${rgba[p]},${rgba[p + 1]},${rgba[p + 2]})`;
                }
                ctx.fillText(grid.palette[indices[i]], col * grid.cellWidth, y);
            }
        }
    }

    clear() {
        const { ctx } = this;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
}

// Every glyph, white, one per cell of an ATLAS_COLUMNS-wide grid.
function drawAtlas(grid) {
    const atlas = document.createElement('canvas');
    atlas.width = ATLAS_COLUMNS * grid.cellWidth;
    atlas.height = Math.ceil(grid.palette.length / ATLAS_COLUMNS) * grid.cellHeight;
    const ctx = atlas.getContext('2d');
    ctx.font = `${grid.fontSize}px ${grid.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    grid.palette.forEach((glyph, i) => {
        const x = (i % ATLAS_COLUMNS) * grid.cellWidth;
        const y = Math.floor(i / ATLAS_COLUMNS) * grid.cellHeight + grid.textTop;
        ctx.fillText(glyph, x, y);
    });
    return atlas;
}

function makeTexture(gl, unit) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
}

function linkProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
        }
        gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
}
