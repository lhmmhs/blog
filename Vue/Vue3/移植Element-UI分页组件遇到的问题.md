最近为了学习Vue3.x，开始了网易云的项目，由于项目是pc端的，使用了[element-plus](https://github.com/element-plus/element-plus)，但是使用过程中，发现没有`pagination`分页组件，于是就自己开始移植[element-ui](https://github.com/ElemeFE/element)中的分页组件，其中遇到了一些问题。

组件`pager.vue`的源码：

```html
<template>
  <ul @click="onPagerClick" class="el-pager">
    <li
      :class="{ active: currentPage === 1, disabled }"
      v-if="pageCount > 0"
      class="number">1</li>
    <li
      class="el-icon more btn-quickprev"
      :class="[quickprevIconClass, { disabled }]"
      v-if="showPrevMore">
    </li>
    <li
      v-for="pager in pagers"
      :key="pager"
      :class="{ active: currentPage === pager, disabled }"
      class="number">{{ pager }}</li>
    <li
      class="el-icon more btn-quicknext"
      :class="[quicknextIconClass, { disabled }]"
      v-if="showNextMore">
    </li>
    <li
      :class="{ active: currentPage === pageCount, disabled }"
      class="number"
      v-if="pageCount > 1">{{ pageCount }}</li>
  </ul>
</template>
```

```javascript
<script type="text/babel">
  export default {
    name: 'ElPager',
    props: {
      currentPage: Number,
      pageCount: Number,
      pagerCount: Number,
      disabled: Boolean
    },
    watch: {
      showPrevMore(val) {
        if (!val) this.quickprevIconClass = 'el-icon-more';
      },
      showNextMore(val) {
        if (!val) this.quicknextIconClass = 'el-icon-more';
      }
    },
    methods: {
      onPagerClick(event) {
        const target = event.target;
        if (target.tagName === 'UL' || this.disabled) {
          return;
        }
        let newPage = Number(event.target.textContent);
        const pageCount = this.pageCount;
        const currentPage = this.currentPage;
        const pagerCountOffset = this.pagerCount - 2;
        if (target.className.indexOf('more') !== -1) {
          if (target.className.indexOf('quickprev') !== -1) {
            newPage = currentPage - pagerCountOffset;
          } else if (target.className.indexOf('quicknext') !== -1) {
            newPage = currentPage + pagerCountOffset;
          }
        }
        /* istanbul ignore if */
        if (!isNaN(newPage)) {
          if (newPage < 1) {
            newPage = 1;
          }
          if (newPage > pageCount) {
            newPage = pageCount;
          }
        }
        if (newPage !== currentPage) {
          // 更新当前页码
          this.$emit('change', newPage);
        }
      },
      onMouseenter(direction) {
        if (this.disabled) return;
        if (direction === 'left') {
          this.quickprevIconClass = 'el-icon-d-arrow-left';
        } else {
          this.quicknextIconClass = 'el-icon-d-arrow-right';
        }
      }
    },
    computed: {
      pagers() {
        const pagerCount = this.pagerCount;
        const halfPagerCount = (pagerCount - 1) / 2;
        const currentPage = Number(this.currentPage);
        const pageCount = Number(this.pageCount);
        let showPrevMore = false;
        let showNextMore = false;
        // 处理两侧的省略号
        if (pageCount > pagerCount) {
          if (currentPage > pagerCount - halfPagerCount) {
            showPrevMore = true;
          }
          if (currentPage < pageCount - halfPagerCount) {
            showNextMore = true;
          }
        }
        const array = [];
        // 处理需要显示的中间页码
        if (showPrevMore && !showNextMore) {
          const startPage = pageCount - (pagerCount - 2);
          for (let i = startPage; i < pageCount; i++) {
            array.push(i);
          }
        } else if (!showPrevMore && showNextMore) {
          for (let i = 2; i < pagerCount; i++) {
            array.push(i);
          }
        } else if (showPrevMore && showNextMore) {
          const offset = Math.floor(pagerCount / 2) - 1;
          for (let i = currentPage - offset ; i <= currentPage + offset; i++) {
            array.push(i);
          }
        } else {
          for (let i = 2; i < pageCount; i++) {
            array.push(i);
          }
        }
          
        // 问题所在
        this.showPrevMore = showPrevMore;
        this.showNextMore = showNextMore;
        return array;
      }
    },
    data() {
      return {
        current: null,
        showPrevMore: false,
        showNextMore: false,
        quicknextIconClass: 'el-icon-more',
        quickprevIconClass: 'el-icon-more'
      };
    }
  };
</script>
```

可以看出组件使用了事件委托，在最外层的`ul`元素上绑定了`onPagerClick`事件，核心的逻辑就是计算属性中的处理省略号的显示以及中间页码的显示了。

由于项目中只需要简单的分页功能以及需要适配Vue3.x的写法，我对代码进行了删减和修改，代码：

```html
<template>
  <ul class="pager" @click="onPagerClick">
    <li :class="{ active: data.currentPage === 1 }" v-if="pageCount > 0" class="number">1</li>
    <li class="more btn-quickprev" v-if="data.showPrevMore">...</li>
    <li v-for="pager in pagers" :key="pager" :class="{ active: data.currentPage === pager }" class="number">
      {{ pager }}
    </li>
    <li class="more btn-quicknext" v-if="data.showNextMore">...</li>
    <li :class="{ active: data.currentPage === pageCount }" class="number" v-if="pageCount > 1">
      {{ pageCount }}
    </li>
  </ul>
</template>
```

```javascript
<script>
import { reactive, ref, nextTick, computed, watch } from "vue";

export default {
  props: {
    // 总页数
    pageCount: Number,
    // 页码数
    pagerCount: Number,
  },
  setup(props, { emit }) {
    const data = reactive({
      // 是否显示左侧省略号
      showPrevMore: false,
      // 是否显示右侧省略号
      showNextMore: false,
      currentPage: 1,
    });

    // computed
    const pagers = computed(() => {
      const pagerCount = props.pagerCount;

      // 一半的显示页码数量 7 -> 3
      const halfPagerCount = (pagerCount - 1) / 2;
      const currentPage = Number(data.currentPage);
      const pageCount = Number(props.pageCount);

      // 省略号标记
      let showPrevMore = false;
      let showNextMore = false;

      // 处理显示省略号
      if (pageCount > pagerCount) {
        //  5 > 1 2 3 4
        if (currentPage > pagerCount - halfPagerCount) {
          showPrevMore = true;
        }
        // 96 < 97 98 99 100
        if (currentPage < pageCount - halfPagerCount) {
          showNextMore = true;
        }
      }

      //
      const array = [];

      // 处理显示中间的页码
      if (showPrevMore && !showNextMore) {
        // 1 ... 95 96 97 98 99 100
        const startPage = pageCount - (pagerCount - 2);
        for (let i = startPage; i < pageCount; i++) {
          array.push(i);
        }
      } else if (!showPrevMore && showNextMore) {
        // 1 2 3 4 5 6 ... 100
        for (let i = 2; i < pagerCount; i++) {
          array.push(i);
        }
      } else if (showPrevMore && showNextMore) {
        // 1...3 4 5 6 7 ... 100
        const offset = Math.floor(pagerCount / 2) - 1;
        for (let i = currentPage - offset; i <= currentPage + offset; i++) {
          array.push(i);
        }
      } else {
        for (let i = 2; i < pageCount; i++) {
          array.push(i);
        }
      }
	  
      // 问题所在
      nextTick(() => {
        data.showPrevMore = showPrevMore;
        data.showNextMore = showNextMore;
      });

      return array;
    });

    // methods
    function onPagerClick(event) {
      const target = event.target;

      if (target.tagName === "UL") return;

      let newPage = Number(event.target.textContent);
      const pageCount = props.pageCount;
      const currentPage = data.currentPage;
      const pagerCountOffset = props.pagerCount - 2;

      // 点击省略号
      if (target.className.indexOf("more") !== -1) {
        if (target.className.indexOf("quickprev") !== -1) {
          newPage = currentPage - pagerCountOffset;
        } else if (target.className.indexOf("quicknext") !== -1) {
          newPage = currentPage + pagerCountOffset;
        }
      }

      if (!isNaN(newPage)) {
        if (newPage < 1) {
          newPage = 1;
        }
        if (newPage > pageCount) {
          newPage = pageCount;
        }
      }


      if (newPage !== currentPage) {
        data.currentPage = newPage;
      }
    }

    // watch
    watch(
      () => data.currentPage,
      (page) => {
        emit("currentPage", page);
      }
    );

    return {
      data,
      pagers,
      onPagerClick,
    };
  },
};
</script>
```

移植的过程，发生了一个问题，当我点击的页码数需要显示左侧省略号的时候，没有显示，于是，通过打断点的方式查看`showPrevMore`是否正确被修改，结果是它正确被修改了。

这时候，我就郁闷了，问题出在了哪里，为什么vue2.x可以，vue3.x不可以呢，那么大概率问题是出现在新版本的框架源码里了。

我把这个问题用简单的代码模拟出来，我们先使用vue2.x的版本来模拟：

```javascript
new Vue({
  el: "#app",
  template: `
	<div>
		<div>{{flag}}</div>
		<div @click="onClick">{{updateMsg}}</div>
	</div>
  `,
  methods: {
    onClick() {
      this.msg = "css"
    }
  },
  computed: {
    updateMsg() {
      if (this.msg === "css") {
        this.flag = true
      }
      return 'hello ' + this.msg
    }
  },
  data() {
    return {
      msg: "vue",
      flag: false
    }
  }
})
```

点击修改`msg`属性的值为`css`，就会触发`msg`的`setter`，`msg`中有2个`watcher`，1个是计算属性`watcher`，1个是渲染`watcher`，计算属性`watcher`执行，它的`dirty`被重置为`true`，而渲染`watcher`会被压入异步队列中，等待执行。

渲染`watcher`的执行会重新执行`render`，那么就会访问到计算属性`updateMsg`，触发它的`getter`，计算属性的`dirty`已被重置为`true`，所以会进行重新计算，会执行我们定义的`updateMsg`，此时的`msg`已经被修改为`css`，**执行了`this.flag = true`这行代码，触发了`flag`的`setter`，`flag`中只有1个渲染`watcher`，它会被压入正在执行的异步队列，等待执行**。

**在计算属性被访问之前，`flag`的`vnode`已经被创建完成，但是这时候的它的值还没有改变，是`false`。**，所以当`render`和`patch`都结束后，渲染出的样子是：

```
false
hello css
```

接着会去执行异步队列中刚刚压入的`flag`的渲染`watcher`，再一次执行`render`，去创建新的`vnode`，这一次，`flag`的值是`true`，最后被渲染的结果就是最终的结果：

```
true
hello css
```

当异步队列执行的过程中，触发了某属性的`setter`，它的所有`watcher`会被压入异步队列中，等待执行，而vue3.x已经改变了这个策略。

接下来我们看vue3.x的代码：

```javascript
Vue.createApp({
  template: `
	<div>{{data.flag}}</div>
	<div @click="onClick">{{updateMsg}}</div>
  `,
  setup(props) {
    const data = Vue.reactive({
      msg: 'vue',
      flag: false
    });

    const updateMsg = Vue.computed(() => {
      let msg = data.msg

      if (msg === "css") {
        data.flag = true
      }

      return 'hello ' + data.msg
    })

    function onClick() {
      data.msg = "css"
    }

    return {
      data,
      updateMsg,
      onClick
    };
  },
}).mount("#app")
```

点击修改`msg`属性就会触发`msg`的`setter`，`msg`有1个副作用函数`effect`，计算属性`effect`，它会去执行`scheduler`，先重置自身的`_dirty`属性，再去触发自身的`setter`，而计算属性有1个副作用函数，渲染组件`effect`，它会被压入到异步对队列中，等待执行。

执行渲染组件`effect`，同样会去执行`render`，访问计算属性`updateMsg`，进行重新计算，会执行`data.flag = true`这行代码，并触发了它的`setter`，**但是这一次，它的渲染组件`effect`没有被压入异步队列**，所以当执行完这次完渲染组件的`effect`，更新就会结束，渲染的最终结果就是下面这个样子：

```
false
hello css
```

这就是问题的所在了，那么解决这个问题的关键就在于，异步队列执行的过程中，如果触发了某些属性的`setter`，如何向异步队列中压入这些副作用函数`effect`。

首先，想到的是`nextTick`，vue2.x的`nextTick`是将传入的函数压入到异步队列中，等待执行，但是触发属性的`setter`时候，它的副作用函数`effect`还是不能被入异步队列中，放弃。

其次，想到执行异步队列是`promise`中执行，所以新创建1个`promise`并注册`data.flag = true`，这样就可以等待上一个异步队列中所有任务都执行完，会再次开启一个异步队列，并将`flag`的渲染组件`effect`压入到队列中，就可以了。

```javascript
Promise.resolve().then(() => { data.flag = true })
```

这样问题就解决了，最后我看了一眼vue3.x的`nextTick`：

```javascript
const resolvedPromise = Promise.resolve()

function nextTick(fn) {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(fn) : p
}
```

已经vue2.x版本不一样了，和我的解决方案是相同的。

