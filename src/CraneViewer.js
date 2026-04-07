// src/CraneViewer.js
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GUI } from 'lil-gui'
import Stats from 'three/addons/libs/stats.module.js'

export class CraneViewer {
    constructor(el) {
        this.el = el
        this.scene = new THREE.Scene()
        this.scene.background = null

        this.clock = new THREE.Clock()
        this.mixer = null
        this.model = null
        this.currentActions = {}

        this.animationNames = ['idle', 'up', 'rotation', '爪子0度', '爪子90度']

        this.camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.001, 10000)

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        this.renderer.setClearColor(0x000000, 0)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.setSize(el.clientWidth, el.clientHeight)
        this.el.appendChild(this.renderer.domElement)

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 1.5))
        const dirLight = new THREE.DirectionalLight(0xffffff, 10)
        dirLight.position.set(5, 15, 10)
        this.scene.add(dirLight)

        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.12

        this.stats = new Stats()
        this.stats.dom.style.position = 'absolute'
        this.stats.dom.style.top = '0px'
        this.stats.dom.style.left = '0px'
        this.el.appendChild(this.stats.dom)

        this.gui = null
        this.animate = this.animate.bind(this)
        requestAnimationFrame(this.animate)

        window.addEventListener('resize', this.resize.bind(this))
    }

    loadModel(url = '/jiqi4.glb') {
        new GLTFLoader().load(url, (gltf) => {
            this.model = gltf.scene
            this.scene.add(this.model)

            // 官方风格 + 最大化修复
            this.model.updateMatrixWorld(true)

            this.model.traverse((child) => {
                if (!child.isMesh) return

                console.log(`Mesh: ${child.name} | Skinned: ${!!child.isSkinnedMesh}`)

                if (child.material) {
                    child.material.side = THREE.DoubleSide
                    child.material.depthWrite = true
                    child.material.polygonOffset = true
                    child.material.polygonOffsetFactor = -4.0   // 加强防闪烁
                    child.material.polygonOffsetUnits = 1
                    child.material.needsUpdate = true
                }

                child.frustumCulled = false   // 核心修复

                if (child.isSkinnedMesh) {
                    if (child.skeleton) child.skeleton.update()
                    if (child.geometry) {
                        child.geometry.computeBoundingBox()
                        child.geometry.computeBoundingSphere()
                    }
                }
            })

            this.mixer = new THREE.AnimationMixer(this.model)

            // 动画初始化（idle 用普通模式，其余用 additive）
            gltf.animations.forEach((clip) => {
                let action
                // if (clip.name === 'idle') {
                action = this.mixer.clipAction(clip)
                // action.blendMode = THREE.NormalAnimationBlendMode
                // action.reset().play();
                // } else {
                //     const additive = THREE.AnimationUtils.makeClipAdditive(clip)
                //     action = this.mixer.clipAction(additive)
                //     action.blendMode = THREE.AdditiveAnimationBlendMode
                // }

                action.play()
                action.paused = true
                // action.setEffectiveWeight(clip.name === 'idle' ? 1 : 0)

                this.currentActions[clip.name] = action
            })

            this.fitCameraToModel()

            // 强制多次更新（非常重要！让 bind pose 下的 SkinnedMesh 正确显示）
            for (let i = 0; i < 5; i++) {
                this.mixer.update(0.016)
                this.model.traverse((child) => {
                    if (child.isSkinnedMesh && child.skeleton) child.skeleton.update()
                })
            }

            console.log('✅ 模型加载完成')
            this.createGUI()
        })
    }

    fitCameraToModel() {
        if (!this.model) return
        const box = new THREE.Box3().setFromObject(this.model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        this.model.position.sub(center)

        const maxDim = Math.max(size.x, size.y, size.z)
        const distance = maxDim * 2.5

        this.camera.position.set(distance * 0.5, maxDim * 0.8, distance)
        this.controls.target.copy(center)
        this.controls.update()
    }

    createGUI() {
        this.gui = new GUI({ width: 300 })
        this.gui.title('起重机控制')

        this.animationNames.forEach(name => {
            if (!this.currentActions[name]) return
            const folder = this.gui.addFolder(name)
            const action = this.currentActions[name]

            folder.add({ progress: 0 }, 'progress', 0, 100, 0.1).name('进度')
                .onChange(v => {
                    if (action.paused) {
                        this.setOnlyActive(name)
                        action.reset().setEffectiveWeight(1).play()
                    }
                    action.time = (v / 100) * (action.getClip().duration || 1);
                    action.paused = true
                })

            folder.add({ speed: 1 }, 'speed', 0.1, 5).name('速度')
                .onChange(s => action.setEffectiveTimeScale(s))

            folder.add({
                toggle: () => {
                    if (action.paused) {
                        this.setOnlyActive(name)
                        action.reset().setEffectiveWeight(1).play()
                    } else {
                        action.paused = true
                    }
                }
            }, 'toggle').name('▶ 播放 / ⏸ 暂停')

            folder.open()
        })

        this.gui.add({ fit: () => this.fitCameraToModel() }, 'fit').name('重新适配相机')
    }

    setOnlyActive(activeName) {
        const duration = 0.5; // 过渡时间（秒）
        Object.keys(this.currentActions).forEach(n => {
            const action = this.currentActions[n];
            if (n === activeName) {
                action.enabled = true;
                action.reset();
                action.setEffectiveWeight(1);
                action.fadeIn(duration);
                action.play();
            } else {
                // 使用 fadeOut 而不是直接 stop，能让骨骼平滑回到初始或目标位
                action.fadeOut(duration);
            }
        });
    }

    resize() {
        this.camera.aspect = this.el.clientWidth / this.el.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(this.el.clientWidth, this.el.clientHeight)
    }

    animate() {
        requestAnimationFrame(this.animate)
        const delta = this.clock.getDelta()
        if (this.mixer) this.mixer.update(delta)

        this.controls.update()
        this.stats.update()
        this.renderer.render(this.scene, this.camera)
    }

    dispose() {
        window.removeEventListener('resize', this.resize)
        if (this.gui) this.gui.destroy()
        if (this.renderer) this.renderer.dispose()
    }
}