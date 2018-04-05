# MStech NodeJS QRCode decoder

## Dependency
- ZXing Binary
- Microsoft VC++ Redist 2010

## Install as global module
```sh
npm install mstech-node-qrcode
```

### Usage
```sh
qrcode <PATH_TO_IMAGE> [...PARAMS]
```

## Install as local module
```sh
npm install mstech-node-qrcode --save
```

### Usage
```javascript
const QRCode = require('mstech-node-qrcode');
QRCode.decode(PATH_TO_IMAGE)
.then((data) => { ... })
.catch((error) => { ... });
```

## TODO
- Make usable on linux
- Accept multiple images
- Accept remote web hosted images
- Possibility to inject the result template to call a validator