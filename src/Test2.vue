<template>
    <div ref="container" style="width:100%; height:100vh;"></div>
</template>

<script>
import { CraneViewer } from './CraneViewer.js'   // 路径按你实际调整

export default {
    mounted() {
        this.viewer = new CraneViewer(this.$refs.container)
        this.viewer.loadModel()

        // 通过 props 控制（示例）
        // this.viewer.setProgress('up', this.up)
    },
    beforeDestroy() {
        this.viewer?.dispose()
    }
}
</script>