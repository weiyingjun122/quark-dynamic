/*
 * 模式数据
*/
import $map from './map.js';
import { objectToMap, mergeMap } from './utils.js';

let modeHash = {};
let $mode = new Map($map);

// 设置模式数据
export function setModeData(sign, data) {
    const modeMap = modeHash[sign] || new Map();
    modeHash[sign] = mergeMap(modeMap,objectToMap(data));
};

// 获取模式数据
export function getModeData(sign) {
    $mode = new Map($map);
    if (sign && modeHash[sign]) {
        const mode = modeHash[sign];
        mode.forEach((modeValue, key) => {
            const originalValue = $map.get(key) || [];
            $mode.set(key, [...modeValue, ...originalValue]);
        });
    }
    return $mode;
};

export { $mode };
