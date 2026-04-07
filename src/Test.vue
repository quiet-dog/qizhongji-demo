<template>
    <div ref="containerRef" class="three-container"></div>
</template>

<script>
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'lil-gui';
import Stats from 'three/examples/jsm/libs/stats.module.js';

export default {
    name: 'CraneThreeViewer',
    props: {
        up: { type: Number, default: 0 },
        rotation: { type: Number, default: 0 },
        claw0: { type: Number, default: 0 },
        claw90: { type: Number, default: 0 },
        idle: { type: Number, default: 0 }
    },
    data() {
        return {
            scene: null,
            camera: null,
            renderer: null,
            controls: null,
            mixer: null,
            clock: null,
            stats: null,
            gui: null,
            model: null,
            currentActions: {},
            actionParams: {},
            animationNames: ['idle', 'up', 'rotation', '爪子0度', '爪子90度']
        };
    },
    mounted() {
        this.initThree();
        this.loadModel();
        this.animate();
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.onResize);
        if (this.gui) this.gui.destroy();
        if (this.stats) this.stats.dom.remove();
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
    },
    methods: {
        initThree() {
            const container = this.$refs.containerRef;
            this.scene = new THREE.Scene();
            this.scene.background = null;

            this.camera = new THREE.PerspectiveCamera(
                50,
                container.clientWidth / container.clientHeight,
                0.001,
                10000
            );

            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setSize(container.clientWidth, container.clientHeight);
            container.appendChild(this.renderer.domElement);

            // 光照
            this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 1.5));
            const dirLight = new THREE.DirectionalLight(0xffffff, 10);
            dirLight.position.set(5, 15, 10);
            this.scene.add(dirLight);

            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.12;

            this.stats = new Stats();
            this.stats.dom.style.position = 'absolute';
            container.appendChild(this.stats.dom);

            this.clock = new THREE.Clock();
            window.addEventListener('resize', this.onResize);
        },

        loadModel() {
            const loader = new GLTFLoader();
            loader.load('/jiqi4.glb', (gltf) => {
                this.model = gltf.scene;
                this.scene.add(this.model);

                this.model.updateMatrixWorld(true);
                this.model.traverse((child) => {
                    if (!child.isMesh) return;

                    if (child.material) {
                        child.material.side = THREE.DoubleSide;
                        child.material.depthWrite = true;
                        child.material.polygonOffset = true;
                        child.material.polygonOffsetFactor = -4.0;
                        child.material.polygonOffsetUnits = 1;
                    }

                    child.frustumCulled = false;

                    if (child.isSkinnedMesh) {
                        if (child.skeleton) child.skeleton.update();
                        child.geometry.computeBoundingBox();
                        child.geometry.computeBoundingSphere();
                    }
                });

                this.mixer = new THREE.AnimationMixer(this.model);

                gltf.animations.forEach((clip) => {
                    // const action = this.mixer.clipAction(clip);
                    // action.play();
                    // action.paused = true;

                    console.log(`动画名: ${clip.name}`);
                    clip.tracks.forEach(track => {
                        // 输出这个动画到底控制了哪些骨骼
                        console.log(` - 轨道: ${track.name}`);
                    });
                    let action;

                    // 1. 识别需要叠加的动画（除了基础 idle 之外的动作）
                    if (clip.name !== 'idle') {
                        // 关键：将剪辑转为增量模式
                        // 第二个参数 0 表示参考帧（通常是动画的第一帧）
                        const additiveClip = THREE.AnimationUtils.makeClipAdditive(clip);
                        action = this.mixer.clipAction(additiveClip);
                        action.blendMode = THREE.AdditiveAnimationBlendMode;
                    } else {
                        // 基础动画保持 Normal
                        action = this.mixer.clipAction(clip);
                        action.blendMode = THREE.NormalAnimationBlendMode;
                    }

                    // this.currentActions[clip.name] = action;
                    // this.actionParams[clip.name] = {
                    //     progress: 0,
                    //     speed: 1.0,
                    //     playing: false
                    // };
                    this.currentActions[clip.name] = action;
                    action.play();
                    action.paused = true;
                    action.setEffectiveWeight(1); // 增量模式下，权重通常都保持为 1
                    this.actionParams[clip.name] = {
                        progress: 0,
                        speed: 1.0,
                        playing: false
                    };
                });

                this.fitCameraToModel();

                // 初始姿态强制更新
                for (let i = 0; i < 5; i++) {
                    this.mixer.update(0.016);
                    this.model.traverse(c => { if (c.skeleton) c.skeleton.update(); });
                }

                this.createExpandedGUI();
            });
        },

        fitCameraToModel() {
            if (!this.model) return;
            const box = new THREE.Box3().setFromObject(this.model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            this.model.position.sub(center);
            const maxDim = Math.max(size.x, size.y, size.z);
            const distance = maxDim * 2.5;

            this.camera.position.set(distance * 0.5, maxDim * 0.8, distance);
            this.controls.target.copy(new THREE.Vector3(0, 0, 0));
            this.controls.update();
        },

        createExpandedGUI() {
            this.gui = new GUI({ width: 300, title: '起重机控制' });

            this.animationNames.forEach(name => {
                const action = this.currentActions[name];
                if (!action) return;

                const folder = this.gui.addFolder(name);
                const params = this.actionParams[name];

                folder.add(params, 'progress', 0, 100, 0.1).name('进度').onChange(v => {
                    this.setOnlyActiveAction(name);
                    action.time = (v / 100) * action.getClip().duration;
                    action.paused = true;
                });

                folder.add(params, 'speed', 0.1, 5).name('速度').onChange(v => {
                    action.setEffectiveTimeScale(v);
                });

                folder.add({
                    toggle: () => {
                        params.playing = !params.playing;
                        if (params.playing) {
                            this.setOnlyActiveAction(name);
                            action.paused = false;
                            action.play();
                        } else {
                            action.paused = true;
                        }
                    }
                }, 'toggle').name('▶ 播放 / ⏸ 暂停');

                folder.open();
            });

            this.gui.add({ fit: () => this.fitCameraToModel() }, 'fit').name('重新适配相机');
        },

        setOnlyActiveAction(activeName) {
            const duration = 0.5;
            Object.keys(this.currentActions).forEach(n => {
                const action = this.currentActions[n];
                if (n === activeName) {
                    action.enabled = true;
                    action.setEffectiveWeight(1);
                    action.fadeIn(duration);
                } else {
                    action.fadeOut(duration);
                }
            });
        },

        onResize() {
            const container = this.$refs.containerRef;
            if (!container) return;
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        },

        animate() {
            requestAnimationFrame(this.animate);
            const delta = this.clock.getDelta();

            if (this.mixer) {
                this.mixer.update(delta);
                // 同步 GUI 进度条
                this.animationNames.forEach(name => {
                    const params = this.actionParams[name];
                    const action = this.currentActions[name];
                    if (params && !action.paused) {
                        params.progress = (action.time / action.getClip().duration) * 100;
                    }
                });
            }

            if (this.controls) this.controls.update();
            if (this.stats) this.stats.update();
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        },

        updateActionProgress(name, progress) {
            const action = this.currentActions[name];
            if (action) {
                action.enabled = true;
                action.paused = false; // 先解锁暂停
                action.setEffectiveWeight(1);

                const clipDuration = action.getClip().duration;
                // 进度转换：0-1 映射到 0-duration
                // 关键：对 progress 做一个极小的偏移，避免停在 0 或 100% 的临界点触发复位
                action.time = Math.max(0.0001, Math.min(progress * clipDuration, clipDuration - 0.0001));

                action.paused = true; // 设完时间后再暂停，固定在那一帧
            }
        }
    },
    watch: {
        up(val) { this.updateActionProgress('up', val); },
        rotation(val) { this.updateActionProgress('rotation', val); },
        claw0(val) { this.updateActionProgress('爪子0度', val); },
        claw90(val) { this.updateActionProgress('爪子90度', val); },
        idle(val) { this.updateActionProgress('idle', val); }
    }
};
</script>

<style scoped>
.three-container {
    width: 100%;
    height: 100vh;
    overflow: hidden;
    position: relative;
}
</style>