import{r as h,g as de,a as ue,j as s,L as Te}from"./index-B75t0T20.js";import{R as Ie,I as We,F as fe,a as ee,b as z,W as He,B as se,S as ie,V as M,c as Re,U as pe,d as me,e as we,M as Fe,f as P,L as ke,g as Ve,h as Ge,u as Ke,C as Ee,_ as he,i as Je,j as $e,O as qe,k as Ye,l as W,m as Xe,A as Qe,H as te}from"./Stars-DDb0t1JJ.js";const Ae=parseInt(Ie.replace(/\D+/g,"")),_e=Ae>=125?"uv1":"uv2",xe=new se,R=new M;class ae extends We{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry";const t=[-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],e=[-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],a=[0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5];this.setIndex(a),this.setAttribute("position",new fe(t,3)),this.setAttribute("uv",new fe(e,2))}applyMatrix4(t){const e=this.attributes.instanceStart,a=this.attributes.instanceEnd;return e!==void 0&&(e.applyMatrix4(t),a.applyMatrix4(t),e.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(t){let e;t instanceof Float32Array?e=t:Array.isArray(t)&&(e=new Float32Array(t));const a=new ee(e,6,1);return this.setAttribute("instanceStart",new z(a,3,0)),this.setAttribute("instanceEnd",new z(a,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(t,e=3){let a;t instanceof Float32Array?a=t:Array.isArray(t)&&(a=new Float32Array(t));const i=new ee(a,e*2,1);return this.setAttribute("instanceColorStart",new z(i,e,0)),this.setAttribute("instanceColorEnd",new z(i,e,e)),this}fromWireframeGeometry(t){return this.setPositions(t.attributes.position.array),this}fromEdgesGeometry(t){return this.setPositions(t.attributes.position.array),this}fromMesh(t){return this.fromWireframeGeometry(new He(t.geometry)),this}fromLineSegments(t){const e=t.geometry;return this.setPositions(e.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new se);const t=this.attributes.instanceStart,e=this.attributes.instanceEnd;t!==void 0&&e!==void 0&&(this.boundingBox.setFromBufferAttribute(t),xe.setFromBufferAttribute(e),this.boundingBox.union(xe))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ie),this.boundingBox===null&&this.computeBoundingBox();const t=this.attributes.instanceStart,e=this.attributes.instanceEnd;if(t!==void 0&&e!==void 0){const a=this.boundingSphere.center;this.boundingBox.getCenter(a);let i=0;for(let n=0,c=t.count;n<c;n++)R.fromBufferAttribute(t,n),i=Math.max(i,a.distanceToSquared(R)),R.fromBufferAttribute(e,n),i=Math.max(i,a.distanceToSquared(R));this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}applyMatrix(t){return console.warn("THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4()."),this.applyMatrix4(t)}}class je extends ae{constructor(){super(),this.isLineGeometry=!0,this.type="LineGeometry"}setPositions(t){const e=t.length-3,a=new Float32Array(2*e);for(let i=0;i<e;i+=3)a[2*i]=t[i],a[2*i+1]=t[i+1],a[2*i+2]=t[i+2],a[2*i+3]=t[i+3],a[2*i+4]=t[i+4],a[2*i+5]=t[i+5];return super.setPositions(a),this}setColors(t,e=3){const a=t.length-e,i=new Float32Array(2*a);if(e===3)for(let n=0;n<a;n+=e)i[2*n]=t[n],i[2*n+1]=t[n+1],i[2*n+2]=t[n+2],i[2*n+3]=t[n+3],i[2*n+4]=t[n+4],i[2*n+5]=t[n+5];else for(let n=0;n<a;n+=e)i[2*n]=t[n],i[2*n+1]=t[n+1],i[2*n+2]=t[n+2],i[2*n+3]=t[n+3],i[2*n+4]=t[n+4],i[2*n+5]=t[n+5],i[2*n+6]=t[n+6],i[2*n+7]=t[n+7];return super.setColors(i,e),this}fromLine(t){const e=t.geometry;return this.setPositions(e.attributes.position.array),this}}class oe extends Re{constructor(t){super({type:"LineMaterial",uniforms:pe.clone(pe.merge([me.common,me.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new we(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${Ae>=154?"colorspace_fragment":"encodings_fragment"}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA="1":delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(e){this.uniforms.diffuse.value=e}},worldUnits:{enumerable:!0,get:function(){return"WORLD_UNITS"in this.defines},set:function(e){e===!0?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(e){this.uniforms.linewidth.value=e}},dashed:{enumerable:!0,get:function(){return"USE_DASH"in this.defines},set(e){!!e!="USE_DASH"in this.defines&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH="":delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(e){this.uniforms.dashScale.value=e}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(e){this.uniforms.dashSize.value=e}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(e){this.uniforms.dashOffset.value=e}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(e){this.uniforms.gapSize.value=e}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(e){this.uniforms.opacity.value=e}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(e){this.uniforms.resolution.value.copy(e)}},alphaToCoverage:{enumerable:!0,get:function(){return"USE_ALPHA_TO_COVERAGE"in this.defines},set:function(e){!!e!="USE_ALPHA_TO_COVERAGE"in this.defines&&(this.needsUpdate=!0),e===!0?(this.defines.USE_ALPHA_TO_COVERAGE="",this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(t)}}const X=new P,ve=new M,ge=new M,w=new P,E=new P,L=new P,Q=new M,Z=new Ve,A=new ke,ye=new M,F=new se,k=new ie,N=new P;let D,U;function be(o,t,e){return N.set(0,0,-t,1).applyMatrix4(o.projectionMatrix),N.multiplyScalar(1/N.w),N.x=U/e.width,N.y=U/e.height,N.applyMatrix4(o.projectionMatrixInverse),N.multiplyScalar(1/N.w),Math.abs(Math.max(N.x,N.y))}function Ze(o,t){const e=o.matrixWorld,a=o.geometry,i=a.attributes.instanceStart,n=a.attributes.instanceEnd,c=Math.min(a.instanceCount,i.count);for(let r=0,l=c;r<l;r++){A.start.fromBufferAttribute(i,r),A.end.fromBufferAttribute(n,r),A.applyMatrix4(e);const d=new M,u=new M;D.distanceSqToSegment(A.start,A.end,u,d),u.distanceTo(d)<U*.5&&t.push({point:u,pointOnLine:d,distance:D.origin.distanceTo(u),object:o,face:null,faceIndex:r,uv:null,[_e]:null})}}function et(o,t,e){const a=t.projectionMatrix,n=o.material.resolution,c=o.matrixWorld,r=o.geometry,l=r.attributes.instanceStart,d=r.attributes.instanceEnd,u=Math.min(r.instanceCount,l.count),p=-t.near;D.at(1,L),L.w=1,L.applyMatrix4(t.matrixWorldInverse),L.applyMatrix4(a),L.multiplyScalar(1/L.w),L.x*=n.x/2,L.y*=n.y/2,L.z=0,Q.copy(L),Z.multiplyMatrices(t.matrixWorldInverse,c);for(let m=0,S=u;m<S;m++){if(w.fromBufferAttribute(l,m),E.fromBufferAttribute(d,m),w.w=1,E.w=1,w.applyMatrix4(Z),E.applyMatrix4(Z),w.z>p&&E.z>p)continue;if(w.z>p){const v=w.z-E.z,g=(w.z-p)/v;w.lerp(E,g)}else if(E.z>p){const v=E.z-w.z,g=(E.z-p)/v;E.lerp(w,g)}w.applyMatrix4(a),E.applyMatrix4(a),w.multiplyScalar(1/w.w),E.multiplyScalar(1/E.w),w.x*=n.x/2,w.y*=n.y/2,E.x*=n.x/2,E.y*=n.y/2,A.start.copy(w),A.start.z=0,A.end.copy(E),A.end.z=0;const x=A.closestPointToPointParameter(Q,!0);A.at(x,ye);const _=Ge.lerp(w.z,E.z,x),j=_>=-1&&_<=1,B=Q.distanceTo(ye)<U*.5;if(j&&B){A.start.fromBufferAttribute(l,m),A.end.fromBufferAttribute(d,m),A.start.applyMatrix4(c),A.end.applyMatrix4(c);const v=new M,g=new M;D.distanceSqToSegment(A.start,A.end,g,v),e.push({point:g,pointOnLine:v,distance:D.origin.distanceTo(g),object:o,face:null,faceIndex:m,uv:null,[_e]:null})}}}class Me extends Fe{constructor(t=new ae,e=new oe({color:Math.random()*16777215})){super(t,e),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){const t=this.geometry,e=t.attributes.instanceStart,a=t.attributes.instanceEnd,i=new Float32Array(2*e.count);for(let c=0,r=0,l=e.count;c<l;c++,r+=2)ve.fromBufferAttribute(e,c),ge.fromBufferAttribute(a,c),i[r]=r===0?0:i[r-1],i[r+1]=i[r]+ve.distanceTo(ge);const n=new ee(i,2,1);return t.setAttribute("instanceDistanceStart",new z(n,1,0)),t.setAttribute("instanceDistanceEnd",new z(n,1,1)),this}raycast(t,e){const a=this.material.worldUnits,i=t.camera;i===null&&!a&&console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');const n=t.params.Line2!==void 0&&t.params.Line2.threshold||0;D=t.ray;const c=this.matrixWorld,r=this.geometry,l=this.material;U=l.linewidth+n,r.boundingSphere===null&&r.computeBoundingSphere(),k.copy(r.boundingSphere).applyMatrix4(c);let d;if(a)d=U*.5;else{const p=Math.max(i.near,k.distanceToPoint(D.origin));d=be(i,p,l.resolution)}if(k.radius+=d,D.intersectsSphere(k)===!1)return;r.boundingBox===null&&r.computeBoundingBox(),F.copy(r.boundingBox).applyMatrix4(c);let u;if(a)u=U*.5;else{const p=Math.max(i.near,F.distanceToPoint(D.origin));u=be(i,p,l.resolution)}F.expandByScalar(u),D.intersectsBox(F)!==!1&&(a?Ze(this,e):et(this,i,e))}onBeforeRender(t){const e=this.material.uniforms;e&&e.resolution&&(t.getViewport(X),this.material.uniforms.resolution.value.set(X.z,X.w))}}class tt extends Me{constructor(t=new je,e=new oe({color:Math.random()*16777215})){super(t,e),this.isLine2=!0,this.type="Line2"}}const Oe=h.forwardRef(function({points:t,color:e=16777215,vertexColors:a,linewidth:i,lineWidth:n,segments:c,dashed:r,...l},d){var u,p;const m=Ke(j=>j.size),S=h.useMemo(()=>c?new Me:new tt,[c]),[b]=h.useState(()=>new oe),x=(a==null||(u=a[0])==null?void 0:u.length)===4?4:3,_=h.useMemo(()=>{const j=c?new ae:new je,B=t.map(v=>{const g=Array.isArray(v);return v instanceof M||v instanceof P?[v.x,v.y,v.z]:v instanceof we?[v.x,v.y,0]:g&&v.length===3?[v[0],v[1],v[2]]:g&&v.length===2?[v[0],v[1],0]:v});if(j.setPositions(B.flat()),a){e=16777215;const v=a.map(g=>g instanceof Ee?g.toArray():g);j.setColors(v.flat(),x)}return j},[t,c,a,x]);return h.useLayoutEffect(()=>{S.computeLineDistances()},[t,S]),h.useLayoutEffect(()=>{r?b.defines.USE_DASH="":delete b.defines.USE_DASH,b.needsUpdate=!0},[r,b]),h.useEffect(()=>()=>{_.dispose(),b.dispose()},[_]),h.createElement("primitive",he({object:S,ref:d},l),h.createElement("primitive",{object:_,attach:"geometry"}),h.createElement("primitive",he({object:b,attach:"material",color:e,vertexColors:!!a,resolution:[m.width,m.height],linewidth:(p=i??n)!==null&&p!==void 0?p:1,dashed:r,transparent:x===4},l)))}),V=Math.PI/180,nt=2451545,Ce={Mercury:[[.38709927,.20563593,7.00497902,252.2503235,77.45779628,48.33076593],[37e-8,1906e-8,-.00594749,149472.67411175,.16047689,-.12534081]],Venus:[[.72333566,.00677672,3.39467605,181.9790995,131.60246718,76.67984255],[39e-7,-4107e-8,-7889e-7,58517.81538729,.00268329,-.27769418]],Earth:[[1.00000261,.01671123,-1531e-8,100.46457166,102.93768193,0],[562e-8,-4392e-8,-.01294668,35999.37244981,.32327364,0]],Mars:[[1.52371034,.0933941,1.84969142,-4.55343205,-23.94362959,49.55953891],[1847e-8,7882e-8,-.00813131,19140.30268499,.44441088,-.29257343]],Jupiter:[[5.202887,.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-11607e-8,-13253e-8,-.00183714,3034.74612775,.21252668,.20469106]],Saturn:[[9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-.0012506,-50991e-8,.00193609,1222.49362201,-.41897216,-.28867794]],Uranus:[[19.18916464,.04725744,.77263783,313.23810451,170.9542763,74.01692503],[-.00196176,-4397e-8,-.00242939,428.48202785,.40805281,.04240589]],Neptune:[[30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574],[26291e-8,5105e-8,35372e-8,218.45945325,-.32241464,-.00508664]]},st={Mercury:{color:"#a8a29e",radiusKm:2440,moons:[]},Venus:{color:"#fcd34d",radiusKm:6052,moons:[]},Earth:{color:"#60a5fa",radiusKm:6371,moons:[{name:"Moon",aKm:384400,periodD:27.322}]},Mars:{color:"#f87171",radiusKm:3390,moons:[{name:"Phobos",aKm:9376,periodD:.319},{name:"Deimos",aKm:23463,periodD:1.262}]},Jupiter:{color:"#fdba74",radiusKm:69911,moons:[{name:"Io",aKm:421700,periodD:1.769},{name:"Europa",aKm:671034,periodD:3.551},{name:"Ganymede",aKm:1070412,periodD:7.155},{name:"Callisto",aKm:1882709,periodD:16.689}]},Saturn:{color:"#fde68a",radiusKm:58232,moons:[{name:"Enceladus",aKm:238042,periodD:1.37},{name:"Titan",aKm:1221870,periodD:15.945}]},Uranus:{color:"#a5f3fc",radiusKm:25362,moons:[{name:"Titania",aKm:435910,periodD:8.706}]},Neptune:{color:"#93c5fd",radiusKm:24622,moons:[{name:"Triton",aKm:354759,periodD:-5.877}]}};function it(o,t){let e=t<.8?o:Math.PI;for(let a=0;a<30;a++){const i=(e-t*Math.sin(e)-o)/(1-t*Math.cos(e));if(e-=i,Math.abs(i)<1e-10)break}return e}function re(o,t,e,a,i,n){const c=it((n%360+360)%360*V,t),r=o*(Math.cos(c)-t),l=o*Math.sqrt(1-t*t)*Math.sin(c),[d,u,p]=[e*V,a*V,i*V],m=Math.cos(u),S=Math.sin(u),b=Math.cos(d),x=Math.sin(d),_=Math.cos(p),j=Math.sin(p);return[(m*_-S*j*b)*r+(-m*j-S*_*b)*l,(S*_+m*j*b)*r+(-S*j+m*_*b)*l,j*x*r+_*x*l]}function Le(o,t){const[e,a]=Ce[o],i=(t-nt)/36525,[n,c,r,l,d,u]=e.map((p,m)=>p+a[m]*i);return[n,c,r,u,d-u,l-d]}function at(o,t){return re(...Le(o,t))}function Ne(o,t,e,a,i,n=256){const c=[];for(let r=0;r<=n;r++)c.push(re(o,t,e,a,i,360*r/n));return c}function G(o){return o.getTime()/864e5+24405875e-1}function ot(o){return new Date((o-24405875e-1)*864e5)}const H=10,ne=[["MBA","Main belt","#64748b"],["IMB","Inner main belt","#94a3b8"],["OMB","Outer main belt","#78716c"],["APO","NEO Apollo","#f87171"],["ATE","NEO Aten","#fb923c"],["AMO","NEO Amor","#facc15"],["IEO","NEO Atira","#f472b6"],["MCA","Mars-crossers","#c084fc"],["TJN","Jupiter Trojans","#4ade80"],["CEN","Centaurs","#2dd4bf"],["TNO","Trans-Neptunian objects","#60a5fa"],["PAA","Parabolic","#e5e7eb"],["HYA","Hyperbolic","#e5e7eb"],["AST","Other asteroids","#a3a3a3"],["JFc","Jupiter-family comets","#22d3ee"],["JFC","Jupiter-family comets","#22d3ee"],["HTC","Halley-type comets","#a5f3fc"],["ETc","Encke-type comets","#67e8f9"],["CTc","Chiron-type comets","#67e8f9"],["COM","Comets","#cffafe"],["PAR","Parabolic","#fff"],["HYP","Hyperbolic","#fff"],["OTHER","Other","#888"]],rt=`
attribute vec3 elA; attribute vec3 elB; attribute float cls; attribute float hmag;
uniform float uDays; uniform float uScale; uniform float uVisible[23]; uniform vec3 uColors[23];
uniform float uHmax; uniform float uSize; varying vec3 vColor; varying float vAlpha;
void main() {
  int c = int(cls + 0.5);
  float a = elA.x; float e = elA.y;
  if (uVisible[c] < 0.5 || hmag > uHmax || a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float n = 0.9856076686 / pow(a, 1.5);
  float M = radians(mod(elB.z + n * uDays, 360.0));
  float E = M + e * sin(M);
  for (int k = 0; k < 8; k++) { E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E)); }
  float xp = a * (cos(E) - e); float yp = a * sqrt(max(0.0, 1.0 - e * e)) * sin(E);
  float I = radians(elA.z); float O = radians(elB.x); float W = radians(elB.y);
  float cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I), cW = cos(W), sW = sin(W);
  float x = (cO*cW - sO*sW*cI) * xp + (-cO*sW - sO*cW*cI) * yp;
  float y = (sO*cW + cO*sW*cI) * xp + (-sO*sW + cO*cW*cI) * yp;
  float z = (sW*sI) * xp + (cW*sI) * yp;
  vec4 mv = modelViewMatrix * vec4(vec3(x, z, -y) * uScale, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (c >= 3 && c <= 6 ? 1.8 : 1.0);
  vColor = uColors[c]; vAlpha = (c >= 3 && c <= 6) ? 0.9 : 0.16;
}`,lt=`
varying vec3 vColor; varying float vAlpha;
void main() { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vColor, vAlpha); }`;function K(o){return new M(o[0]*H,o[2]*H,-o[1]*H)}function ct({cat:o,jd:t,visible:e,hmax:a,size:i}){const n=h.useRef(null),c=h.useMemo(()=>{const l=new Ye,d=o.count,u=o.orbits,p=new Float32Array(d*3),m=new Float32Array(d*3),S=new Float32Array(d),b=new Float32Array(d);for(let x=0;x<d;x++)p[3*x]=u[7*x],p[3*x+1]=u[7*x+1],p[3*x+2]=u[7*x+2],m[3*x]=u[7*x+3],m[3*x+1]=u[7*x+4],m[3*x+2]=u[7*x+5],S[x]=u[7*x+6],b[x]=o.classes[x];return l.setAttribute("position",new W(new Float32Array(d*3),3)),l.setAttribute("elA",new W(p,3)),l.setAttribute("elB",new W(m,3)),l.setAttribute("hmag",new W(S,1)),l.setAttribute("cls",new W(b,1)),l.boundingSphere=new ie(new M,1e6),l},[o]),r=h.useMemo(()=>({uDays:{value:0},uScale:{value:H},uHmax:{value:99},uSize:{value:1.5},uVisible:{value:new Array(23).fill(1)},uColors:{value:ne.map(([,,l])=>new Ee(l)).map(l=>new M(l.r,l.g,l.b))}}),[]);return Xe(()=>{n.current&&(n.current.uniforms.uDays.value=t-o.meta.ref_epoch_jd_tdb,n.current.uniforms.uVisible.value=e.map(l=>l?1:0),n.current.uniforms.uHmax.value=a,n.current.uniforms.uSize.value=i)}),s.jsx("points",{geometry:c,frustumCulled:!1,children:s.jsx("shaderMaterial",{ref:n,vertexShader:rt,fragmentShader:lt,uniforms:r,transparent:!0,depthWrite:!1,blending:Qe})})}function dt({jd:o,showMoons:t}){return s.jsxs(s.Fragment,{children:[s.jsxs("mesh",{children:[s.jsx("sphereGeometry",{args:[.6,32,32]}),s.jsx("meshBasicMaterial",{color:"#fbbf24"})]}),s.jsx("pointLight",{intensity:2,distance:0,decay:0}),Object.keys(Ce).map(e=>{const a=Le(e,o),i=K(at(e,o)),n=st[e],c=.12+Math.log10(n.radiusKm/2e3)*.25,r=Ne(a[0],a[1],a[2],a[3],a[4],256).map(K);return s.jsxs("group",{children:[s.jsx(Oe,{points:r,color:n.color,lineWidth:1,transparent:!0,opacity:.35}),s.jsxs("mesh",{position:i,children:[s.jsx("sphereGeometry",{args:[c,24,24]}),s.jsx("meshStandardMaterial",{color:n.color,emissive:n.color,emissiveIntensity:.25})]}),s.jsx(te,{position:i,distanceFactor:void 0,style:{pointerEvents:"none"},children:s.jsx("div",{className:"translate-x-3 -translate-y-3 text-[11px] text-slate-200 whitespace-nowrap",children:e})}),t&&n.moons.map(l=>{const d=(o-2451545)/l.periodD*2*Math.PI,u=c+.25+Math.log10(l.aKm/5e3)*.35,p=i.clone().add(new M(Math.cos(d)*u,0,Math.sin(d)*u));return s.jsxs("group",{children:[s.jsxs("mesh",{position:p,children:[s.jsx("sphereGeometry",{args:[.05,12,12]}),s.jsx("meshStandardMaterial",{color:"#e2e8f0"})]}),s.jsx(te,{position:p,style:{pointerEvents:"none"},children:s.jsx("div",{className:"translate-x-2 text-[9px] text-slate-400 whitespace-nowrap",children:l.name})})]},l.name)})]},e)})]})}function Se({el:o,jd:t,label:e,epoch:a=24610005e-1,color:i="#f472b6"}){const[n,c,r,l,d,u]=o,p=.9856076686/Math.pow(n,1.5),m=K(re(n,c,r,l,d,u+p*(t-a))),S=h.useMemo(()=>Ne(n,c,r,l,d,400).map(K),[n,c,r,l,d]);return s.jsxs(s.Fragment,{children:[s.jsx(Oe,{points:S,color:i,lineWidth:2.5,depthTest:!1,renderOrder:10}),s.jsxs("mesh",{position:m,renderOrder:11,children:[s.jsx("sphereGeometry",{args:[.18,16,16]}),s.jsx("meshBasicMaterial",{color:i,depthTest:!1})]}),s.jsx(te,{position:m,children:s.jsx("div",{className:"translate-x-3 -translate-y-4 rounded bg-space-950/70 px-1.5 text-xs whitespace-nowrap border",style:{color:i,borderColor:i},children:e})})]})}function ut(o){var l;const t=o.split(/\r?\n/).filter(d=>d.trim()&&!d.startsWith("#")),e=(l=t[0])!=null&&l.includes(";")?";":",",a=(t[0]??"").split(e).map(d=>d.trim().toLowerCase().replace(/"/g,"")),n=["a","e","i","om","w","ma","epoch"].map(d=>a.indexOf(d));if(n.some(d=>d<0))throw new Error("Required columns: name, a, e, i, om, w, ma, epoch (au, degrees, JD).");const c=Math.max(a.indexOf("name"),a.indexOf("full_name"),a.indexOf("pdes")),r=[];for(const d of t.slice(1)){const u=d.split(e).map(m=>m.trim().replace(/"/g,"")),p=n.map(m=>Number(u[m]));p.some(m=>!Number.isFinite(m))||p[0]<=0||p[1]>=1||r.push({name:c>=0?u[c]:`body ${r.length+1}`,el:p.slice(0,6),epoch:p[6]})}if(!r.length)throw new Error("No valid elliptical orbits were found in the file.");return r.slice(0,200)}function xt({focus:o,onOpenProspect:t}){const[e,a]=h.useState(null),[i,n]=h.useState("Downloading the orbital catalog (SBDB, 1.58 million bodies)…"),[c,r]=h.useState(G(new Date)),[l,d]=h.useState(0),[u,p]=h.useState(ne.map(()=>!0)),[m,S]=h.useState(30),[b,x]=h.useState(1.3),[_,j]=h.useState(!0),[B,v]=h.useState(o??""),[g,De]=h.useState(null),[J,le]=h.useState([]),[O,ft]=h.useState(null),[ce,T]=h.useState(""),[$,pt]=h.useState(0);h.useEffect(()=>{(async()=>{try{const[f,y,C]=await Promise.all([de("/api/catalog/meta"),ue(`/api/catalog/orbits.bin?v=${$}`),ue(`/api/catalog/classes.bin?v=${$}`)]);a({orbits:new Float32Array(y),classes:new Uint8Array(C),count:f.count,meta:f}),n("")}catch(f){n(`Could not load the catalog: ${f.message}`)}})()},[$]),h.useEffect(()=>{if(!l)return;let f=performance.now(),y=0;const C=I=>{r(Y=>Y+(I-f)/1e3*l),f=I,y=requestAnimationFrame(C)};return y=requestAnimationFrame(C),()=>cancelAnimationFrame(y)},[l]);const q=async f=>{if(!(!e||!f.trim())){T("");try{const y=await de(`/api/catalog-find?q=${encodeURIComponent(f)}`),C=e.orbits.subarray(y.index*7,y.index*7+7);De({el:Array.from(C),label:`${f} (${y.pdes})`,pdes:y.pdes})}catch(y){T(y.message)}}};h.useEffect(()=>{o&&e&&(v(o),q(o))},[o,e]);const Be=async()=>{{T(Te);return}},Ue=async f=>{T("");try{le(ut(await f.text()))}catch(y){T(y.message)}},ze=[["NEOs (near-Earth)",[3,4,5,6]],["Main belt",[0,1,2,13]],["Mars-crossers",[7]],["Trojans",[8]],["Centaurs and TNOs",[9,10]],["Comets",[14,15,16,17,18,19,20,21,11,12]]],Pe=ot(c);return s.jsxs("div",{className:"grid gap-4 lg:grid-cols-[1fr_320px]",children:[s.jsxs("div",{className:"panel relative overflow-hidden",style:{height:"74vh",minHeight:460},children:[s.jsxs(Je,{camera:{position:[0,45,70],fov:50,near:.01,far:5e4},dpr:[1,2],children:[s.jsx("color",{attach:"background",args:["#03050c"]}),s.jsx("ambientLight",{intensity:.25}),s.jsx($e,{radius:8e3,depth:50,count:4e3,factor:60,fade:!0}),e&&s.jsx(ct,{cat:e,jd:c,visible:u,hmax:m,size:b}),s.jsx(dt,{jd:c,showMoons:_}),g&&s.jsx(Se,{el:g.el,jd:c,label:g.label}),J.map(f=>s.jsx(Se,{el:f.el,jd:c,label:f.name,epoch:f.epoch,color:"#fbbf24"},f.name)),s.jsx(qe,{makeDefault:!0,enableDamping:!0,maxDistance:5e3})]}),i&&s.jsx("div",{className:"absolute inset-0 grid place-items-center text-sm text-slate-200 bg-space-950/60",children:i}),s.jsxs("div",{className:"absolute left-3 top-3 rounded-lg bg-space-950/70 px-3 py-2 text-xs font-mono",children:[Pe.toISOString().slice(0,10)," · ",e?`${e.count.toLocaleString("en")} bodies`:"…"]}),s.jsxs("div",{className:"absolute bottom-3 left-3 right-3 rounded-lg bg-space-950/70 px-3 py-2 text-[11px] text-slate-400",children:["Positions ",s.jsx("span",{className:"ev-calculated",children:"calculated"})," with two-body Keplerian propagation on the GPU (SBDB elements retrieved ",e==null?void 0:e.meta.retrieved_utc.slice(0,10),"; planets: Standish/JPL mean elements). No perturbations: accuracy degrades years away from the epoch. Planet and moon sizes are enlarged and lunar distances are ",s.jsx("span",{className:"ev-illustrative",children:"illustrative"}),"."]})]}),s.jsxs("aside",{className:"panel p-4 space-y-3 text-sm",children:[s.jsx("h2",{className:"font-semibold text-ion",children:"Living Solar System"}),s.jsxs("div",{className:"flex gap-2",children:[s.jsx("input",{className:"input",placeholder:"Bennu, Psyche, 433, 2024 YR4…",value:B,onChange:f=>v(f.target.value),onKeyDown:f=>f.key==="Enter"&&q(B)}),s.jsx("button",{className:"btn",onClick:()=>q(B),children:"Go"})]}),ce&&s.jsx("p",{className:"text-xs text-rose-300",children:ce}),g&&s.jsxs("div",{className:"rounded-lg bg-space-800 p-3 text-xs space-y-1",children:[s.jsx("div",{className:"font-semibold text-pink-200",children:g.label}),s.jsxs("div",{className:"font-mono",children:["a=",g.el[0].toFixed(3)," au · e=",g.el[1].toFixed(3)," · i=",g.el[2].toFixed(2),"° · H=",g.el[6].toFixed(1)]}),s.jsx("button",{className:"btn text-xs mt-1",onClick:()=>t(g.pdes),children:"Composition, accessibility and mission →"})]}),s.jsxs("div",{children:[s.jsx("span",{className:"label",children:"Date"}),s.jsx("input",{type:"range",className:"w-full",min:G(new Date("1990-01-01")),max:G(new Date("2100-01-01")),step:1,value:c,onChange:f=>r(Number(f.target.value)),"aria-label":"Date"}),s.jsxs("div",{className:"flex flex-wrap gap-1",children:[[["⏸",0],["1 d/s",1],["30 d/s",30],["1 yr/s",365]].map(([f,y])=>s.jsx("button",{className:`btn text-xs ${l===y?"btn-on":""}`,onClick:()=>d(Number(y)),children:f},f)),s.jsx("button",{className:"btn text-xs",onClick:()=>{r(G(new Date)),d(0)},children:"Today"})]})]}),s.jsxs("div",{children:[s.jsx("span",{className:"label",children:"Populations"}),ze.map(([f,y])=>s.jsxs("label",{className:"flex items-center gap-2 text-xs",children:[s.jsx("input",{type:"checkbox",checked:y.every(C=>u[C]),onChange:C=>{const I=[...u];y.forEach(Y=>I[Y]=C.target.checked),p(I)}}),s.jsx("span",{className:"inline-block h-2.5 w-2.5 rounded-full",style:{background:ne[y[0]][2]}}),f]},f))]}),s.jsxs("label",{className:"block",children:[s.jsxs("span",{className:"label",children:["Absolute magnitude H ≤ ",m," (size filter)"]}),s.jsx("input",{type:"range",className:"w-full",min:5,max:30,step:.5,value:m,onChange:f=>S(Number(f.target.value))})]}),s.jsxs("label",{className:"block",children:[s.jsx("span",{className:"label",children:"Point size"}),s.jsx("input",{type:"range",className:"w-full",min:.5,max:4,step:.1,value:b,onChange:f=>x(Number(f.target.value))})]}),s.jsxs("label",{className:"flex items-center gap-2 text-xs",children:[s.jsx("input",{type:"checkbox",checked:_,onChange:f=>j(f.target.checked)})," Major moons (illustrative)"]}),s.jsxs("div",{className:"space-y-2 border-t border-white/10 pt-2",children:[s.jsx("div",{className:"label",children:"Catalog"}),s.jsx("button",{className:"btn text-xs w-full",onClick:Be,disabled:(O==null?void 0:O.status)==="running",children:"⟳ Update orbits from NASA/JPL SBDB"}),O&&s.jsxs("p",{className:`text-[11px] ${O.status==="error"?"text-rose-300":"text-slate-400"}`,children:[O.status==="running"?"Working: ":O.status==="done"?"Done: ":"Error: ",O.error??O.log[O.log.length-1]??"starting…"]}),s.jsxs("label",{className:"btn text-xs w-full inline-block text-center cursor-pointer",children:["Add my own orbits (CSV)",s.jsx("input",{type:"file",accept:".csv,.txt",className:"hidden",onChange:f=>{var y;return((y=f.target.files)==null?void 0:y[0])&&Ue(f.target.files[0])}})]}),s.jsxs("p",{className:"text-[11px] text-slate-500",children:["CSV columns: ",s.jsx("code",{children:"name, a, e, i, om, w, ma, epoch"})," (au, degrees, JD TDB), as exported by the JPL SBDB Query tool. Up to 200 bodies, drawn in yellow."]}),J.length>0&&s.jsxs("p",{className:"text-xs text-amber-300",children:[J.length," custom orbits shown. ",s.jsx("button",{className:"underline",onClick:()=>le([]),children:"Clear"})]})]}),s.jsxs("p",{className:"text-[11px] text-slate-500",children:["NEOs are drawn larger and brighter. Scale: 1 au = ",H," units. Drag to rotate, scroll to zoom."]})]})]})}export{xt as default};
