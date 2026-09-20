/**
 * Procedural cloud shell.
 *
 * Clouds are generated in the fragment shader from 3D simplex noise rather
 * than sampled from an image. That keeps the app asset-free, and it also
 * animates better than a rotating texture: the field drifts *and* evolves,
 * because the noise is sampled in 4D (position plus time).
 *
 * The simplex implementation below is the standard Ashima/Gustavson formulation
 * that is published under the MIT licence and is ubiquitous in WebGL shaders.
 */

export const cloudVertexShader = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vPosition = position;
    vWorldNormal = normalize( mat3( modelMatrix ) * normal );
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const cloudFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform float uCoverage;
  uniform float uOpacity;

  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  // --- Ashima simplex noise (MIT) ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p);
      p *= 2.02;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    // Drift westward and evolve slowly on a separate axis.
    vec3 samplePoint = normalize( vPosition ) * 2.4;
    samplePoint.x += uTime * 0.012;

    float base = fbm( samplePoint + vec3( 0.0, 0.0, uTime * 0.006 ) );
    float detail = fbm( samplePoint * 3.1 + vec3( 5.2, 1.3, uTime * 0.01 ) );

    float density = base * 0.65 + detail * 0.35;
    density = smoothstep( uCoverage, uCoverage + 0.42, density * 0.5 + 0.5 );

    // Thin the band near the poles, where the sphere UVs pinch.
    float polarFade = 1.0 - pow( abs( normalize( vPosition ).y ), 6.0 );
    density *= polarFade;

    if ( density < 0.01 ) discard;

    // Light the cloud tops with the same sun direction as the surface.
    float sunDot = dot( normalize( vWorldNormal ), normalize( uSunDirection ) );
    float lit = smoothstep( -0.35, 0.55, sunDot );
    vec3 color = mix( vec3( 0.08, 0.12, 0.2 ), vec3( 1.0 ), lit );

    gl_FragColor = vec4( color, density * uOpacity * ( 0.25 + lit * 0.75 ) );
  }
`;
