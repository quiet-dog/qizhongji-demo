<template>
    <div ref="containerRef" class="three-container"></div>
</template>

<script>
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GUI } from 'lil-gui'

export default {
    name: 'CraneThreeViewer',

    data() {
        return {
            scene: null,
            camera: null,
            renderer: null,
            controls: null,
            mixer: null,
            clock: null,
            gui: null,

            currentActions: {},   // 所有动画 Action
            actionParams: {},     // 每个动画的参数
            activeActions: {},    // 是否正在播放（备用）

            animationNames: [
                'idle',
                'up',
                'rotation',
                '爪子0度',
                '爪子90度'
            ]
        }
    },

    props: {
        // 动画进度
        up: {
            type: Number,
            default: 0
        },
        rotation: {
            type: Number,
            default: 0
        },
        claw0: {
            type: Number,
            default: 0
        },
        claw90: {
            type: Number,
            default: 0
        },
        idle: {
            type: Number,
            default: 0
        }
    },

    mounted() {
        this.initThree()
        this.loadModel()
        this.animate()
    },

    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        if (this.gui) this.gui.destroy()
        if (this.renderer) {
            this.renderer.dispose()
            if (this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
            }
        }
    },

    methods: {
        initThree() {
            const container = this.$refs.containerRef
            if (!container) return

            this.scene = new THREE.Scene()
            // this.scene.background = new THREE.Color(0xa0a0a0)
            this.scene.background = null // 透明背景

            this.camera = new THREE.PerspectiveCamera(
                50,
                container.clientWidth / container.clientHeight,
                0.1,
                200
            )

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                // 背景透明
                alpha: true
            })

            this.renderer.setClearColor(0x000000, 0) // ✅ 透明背景（alpha=0）
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
            this.renderer.setSize(container.clientWidth, container.clientHeight)
            this.renderer.shadowMap.enabled = true
            container.appendChild(this.renderer.domElement)

            // 光照
            this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 1.5))
            const dirLight = new THREE.DirectionalLight(0xffffff, 10.8)
            dirLight.position.set(10, 15, 10)
            this.scene.add(dirLight)

            // 控制器
            this.controls = new OrbitControls(this.camera, this.renderer.domElement)
            this.controls.enableDamping = true
            this.controls.dampingFactor = 0.08
            this.controls.enabled = false;

            this.clock = new THREE.Clock()

            window.addEventListener('resize', this.onResize)
        },

        fitCameraToModel(model) {
            const box = new THREE.Box3().setFromObject(model)
            const center = new THREE.Vector3()
            const size = new THREE.Vector3()
            box.getCenter(center)
            box.getSize(size)

            model.position.sub(center)
            // 模型旋转调整（如果需要）
            model.rotation.y = -0.7
            // 调整模型大小
            // model.scale.set(2, 2, 2)

            const maxDim = Math.max(size.x, size.y, size.z)
            const fov = this.camera.fov * (Math.PI / 180)
            let distance = (maxDim / 2) / Math.tan(fov / 2) * 1.15

            // 相机位置调整
            this.camera.position.set(0.4, size.y * 0.25, distance)

            // 相机目标调整
            this.controls.target.set(0, size.y * 0.15, 0)

            this.camera.updateProjectionMatrix()
            this.controls.update()
        },

        loadModel() {
            const loader = new GLTFLoader()

            loader.load('/jiqi3.glb', (gltf) => {
                const model = gltf.scene
                this.scene.add(model)

                this.mixer = new THREE.AnimationMixer(model)

                // 初始化所有动画
                gltf.animations.forEach((clip) => {
                    // alert(clip.name)
                    // if (clip.name === 'idle') {
                    // const idleAction = this.mixer.clipAction(clip)
                    // idleAction.play()
                    // this.currentActions[clip.name] = idleAction
                    // return
                    // }
                    let action = null
                    if (clip.name === 'rotation') {
                        // clip.duration = 4 // 强制设置旋转动画为4秒
                        const additiveClip = THREE.AnimationUtils.makeClipAdditive(clip)
                        action = this.mixer.clipAction(additiveClip)
                    } else {
                        action = this.mixer.clipAction(clip)
                    }
                    // const action = this.mixer.clipAction(clip)
                    action.clampWhenFinished = true

                    this.currentActions[clip.name] = action
                    action.play()
                    action.paused = true
                    // 为每个动画创建参数对象
                    this.actionParams[clip.name] = {
                        progress: 0,
                        speed: 1.0,
                        loop: true,
                        playing: false,
                        action: action
                    }
                })

                this.fitCameraToModel(model)

                console.log('所有动画已加载：', Object.keys(this.currentActions))

                // this.createExpandedGUI()
            })
        },

        createExpandedGUI() {
            this.gui = new GUI({ width: 380, title: '起重机动画控制（全部展开）' })

            this.animationNames.forEach((name) => {
                if (!this.currentActions[name]) return

                const folder = this.gui.addFolder(name)
                const params = this.actionParams[name]

                // 进度滑块
                folder.add(params, 'progress', 0, 360, 0.1)
                    .name('进度 (%)')
                    .onChange((percent) => {
                        const action = params.action
                        const duration = action.getClip().duration || 1
                        action.time = (percent / 100) * duration
                        action.paused = true
                    })

                // 播放速度
                folder.add(params, 'speed', 0.1, 5, 0.05)
                    .name('速度')
                    .onChange((speed) => {
                        params.action.setEffectiveTimeScale(speed)
                    })

                // 循环开关
                folder.add(params, 'loop')
                    .name('循环')
                    .onChange((loop) => {
                        params.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
                    })

                // 播放 / 暂停 按钮
                const playButton = {
                    toggle: () => {
                        const action = params.action
                        params.playing = !params.playing

                        if (params.playing) {
                            action.reset()
                            action.setEffectiveTimeScale(params.speed)
                            action.setLoop(params.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
                            action.play()
                        } else {
                            action.paused = true
                        }
                    }
                }

                folder.add(playButton, 'toggle')
                    .name(params.playing ? '⏸ 暂停' : '▶ 播放')

                // 一键停止按钮
                const stopButton = {
                    stop: () => {
                        const action = params.action
                        action.stop()
                        action.reset()
                        params.playing = false
                        params.progress = 0
                    }
                }

                folder.add(stopButton, 'stop').name('⏹ 停止')

                folder.open()
            })

            // 全局操作
            const globalFolder = this.gui.addFolder('全局操作')
            globalFolder.add({
                fit: () => {
                    const model = this.scene.children.find(c => c.type === 'Group') || this.scene
                    this.fitCameraToModel(model)
                }
            }, 'fit').name('🔄 重新适配相机')

            globalFolder.open()
        },

        onResize() {
            if (!this.camera || !this.renderer || !this.$refs.containerRef) return

            this.camera.aspect = this.$refs.containerRef.clientWidth / this.$refs.containerRef.clientHeight
            this.camera.updateProjectionMatrix()
            this.renderer.setSize(this.$refs.containerRef.clientWidth, this.$refs.containerRef.clientHeight)
        },

        animate() {
            requestAnimationFrame(this.animate)

            const delta = this.clock.getDelta()

            if (this.mixer) {
                this.mixer.update(delta)

                // 实时更新进度条
                this.animationNames.forEach((name) => {
                    const params = this.actionParams[name]
                    if (!params || !params.playing) return

                    const action = params.action
                    const duration = action.getClip().duration || 1
                    if (duration > 0) {
                        params.progress = Math.min(100, (action.time / duration) * 100)
                    }
                })
            }

            if (this.controls) this.controls.update()
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera)
            }
        }
    },
    watch: {
        up(newVal) {
            const have = this.currentActions['up']
            if (!have) return
            const params = this.actionParams['up']
            const action = params.action
            const duration = action.getClip().duration || 1
            action.time = (newVal) * duration

        },
        rotation(newVal) {
            const have = this.currentActions['rotation']
            if (!have) return
            const params = this.actionParams['rotation']
            const action = params.action
            const duration = action.getClip().duration || 1
            action.time = (newVal) * duration
        },
        claw0(newVal) {
            const have = this.currentActions['爪子0度']
            if (!have) return
            const params = this.actionParams['爪子0度']
            const action = params.action
            const duration = action.getClip().duration || 1
            action.time = (newVal) * duration

        },
        claw90(newVal) {
            const have = this.currentActions['爪子90度']
            if (!have) return
            const params = this.actionParams['爪子90度']
            const action = params.action
            const duration = action.getClip().duration || 1
            action.time = (newVal) * duration
        },
        idle(newVal) {
            const have = this.currentActions['idle']

            if (!have) return
            const params = this.actionParams['idle']
            const action = params.action
            const duration = action.getClip().duration || 1
            action.time = (newVal) * duration
        }
    }
}
</script>

<style scoped>
.three-container {
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background-color: #00FFFF;
}
</style>