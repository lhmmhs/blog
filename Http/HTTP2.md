#### 多路复用

HTTP2所有请求都是通过1个TCP连接完成。

解决问题：低效TCP利用，队头阻塞

#### 二进制分帧

HTTP2采用二进制格式的数据进行传输，封装为帧。

#### 服务器推送

服务器发送页面HTML时，可以主动发送页面内的静态资。

客户端可以选择拒绝。

#### 首部压缩

客户端和服务端会维护一张**首部表**，所有字段会被存入到这个表，并生成对应的索引，发送同样的字段可以只发送索引号。

解决问题：臃肿消息首部

### 参考文章

* [半小时搞懂 HTTP、HTTPS和HTTP2](https://juejin.cn/post/6894053426112495629)
* [HTTP 协议入门](http://www.ruanyifeng.com/blog/2016/08/http.html)