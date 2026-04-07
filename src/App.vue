<template>
    <div>
        <input type="range" min="0" max="1" step="0.01" v-model.number="up" />
        <input type="range" min="0" max="1" step="0.01" v-model.number="rotation" />
        <input type="range" min="0" max="1" step="0.01" v-model.number="claw0" />
        <input type="range" min="0" max="1" step="0.01" v-model.number="claw90" />
        <input type="range" min="0" max="1" step="0.01" v-model.number="idle" />
        <Test :up="up" :rotation="rotation" :claw0="claw0" :claw90="claw90" :idle="idle" />
        <!-- <Test2 /> -->
    </div>
</template>
<script>
import Test from "./Test.vue";
// import Test2 from "./Test2.vue";
export default {
    name: "Test1",
    components: {
        Test,
        // Test2,
    },
    data() {
        return {
            up: 0,
            rotation: 0,
            claw0: 0,
            claw90: 0,
            idle: 0,
        };
    },
};
</script>
