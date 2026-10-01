import { optionalNumber, project, unproject } from './rules';
test('optional numeric fields preserve unknown, zero and decimal values',()=>{
 expect(optionalNumber('')).toBeNull();expect(optionalNumber('  ')).toBeNull();expect(optionalNumber('0')).toBe(0);expect(optionalNumber('1,25')).toBe(1.25);expect(()=>optionalNumber('NaN')).toThrow();expect(()=>optionalNumber('Infinity')).toThrow();
});
test('map clicks invert screen projection at mobile sizes, including negative longitudes',()=>{
 for(const span of [.04,12,360])for(const point of [[-3.7,40.42],[-4,40],[2,41]] as [number,number][]){const extent={longitude:-3.7,latitude:40.42,span};const restored=unproject(project(point,extent),extent);expect(restored[0]).toBeCloseTo(point[0],10);expect(restored[1]).toBeCloseTo(point[1],10);}
});
