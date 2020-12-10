### 什么是Cookie

Cookie 是网站为了识别用户身份而存储在用户本地的数据，一般不超过4k。

### Cookie的设置

1. 服务器通过Set-Cookie字段设置Cookie
2. 浏览器收到响应后会保存Cookie到本地
3. 直到Cookie过期前，对该服务器的请求都会通过Cookie字段将Cookie发送给服务器

### Cookie属性

* Expires，设置Cookie过期时间，它是一个时间戳
* Max-age，设置Cookie过期时间，它是一个时间长度
* Domain，指定了Cookie可以送达的主机名，不能设置跨域域名
* Path，指定了Cookie可以送达的指定路径
* Secure，标记为 Secure 的 Cookie 只应通过被HTTPS协议加密过的请求发送给服务端
* HttpOnly，防止通过document.cookie访问Cookie
* SameSite，可以让 Cookie 在跨站请求时不会被发送，从而可以阻止CSRF

### SameSite属性值

* **Strict** 仅允许一方请求携带 Cookie，即浏览器将只发送相同站点请求的 Cookie，即当前网页 URL 与请求目标 URL 完全一致。
* **Lax** 允许部分第三方请求携带 Cookie
* **None** 无论是否跨站都会发送 Cookie

### Cookie作用

* 会话状态管理
* 个性化设置
* 浏览器行为跟踪