/**
 * Atmospheric rim glow.
 *
 * Rendered on a slightly larger sphere with `side: BackSide` and additive
 * blending, so we only ever see the far wall of the shell through and around
 * the planet. A Fresnel term concentrates the glow at grazing angles, which is
 * what produces the bright limb; a second term biases it toward the day side
 * so the terminator is not symmetrically lit.
 *
 * Original shader written for this project.
 */

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vWorldNormal = normalize( mat3( modelMatrix ) * normal );
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uGlowColor;
  uniform vec3 uSunDirection;
  uniform float uIntensity;
  uniform float uPower;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize( cameraPosition - vWorldPosition );

    // BackSide rendering flips the normal, so negate before the Fresnel dot.
    vec3 normal = normalize( -vWorldNormal );
    float fresnel = 1.0 - abs( dot( normal, viewDirection ) );
    fresnel = pow( clamp( fresnel, 0.0, 1.0 ), uPower );

    // Bias the glow toward the lit hemisphere and keep a faint night halo.
    float sunAlignment = dot( normalize( vWorldPosition ), normalize( uSunDirection ) );
    float dayBias = smoothstep( -0.55, 0.65, sunAlignment );
    float strength = fresnel * mix( 0.18, 1.0, dayBias ) * uIntensity;

    // Scatter slightly warmer where the sun grazes the limb.
    vec3 color = mix( uGlowColor, vec3( 0.75, 0.88, 1.0 ), dayBias * 0.35 );

    gl_FragColor = vec4( color * strength, strength );
  }
`;
