
export class NumberUtils {
  static safeNumber(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined) return defaultValue;
    
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  static safeAddition(a: any, b: any): number {
    const numA = this.safeNumber(a);
    const numB = this.safeNumber(b);
    return Number((numA + numB).toFixed(2));
  }

  static safeSubtraction(a: any, b: any): number {
    const numA = this.safeNumber(a);
    const numB = this.safeNumber(b);
    return Number((numA - numB).toFixed(2));
  }

  static safeMultiplication(a: any, b: any): number {
    const numA = this.safeNumber(a);
    const numB = this.safeNumber(b);
    return Number((numA * numB).toFixed(2));
  }

  static safeDivision(a: any, b: any, defaultValue: number = 0): number {
    const numA = this.safeNumber(a);
    const numB = this.safeNumber(b);
    
    if (numB === 0) return defaultValue;
    return Number((numA / numB).toFixed(4));
  }
}