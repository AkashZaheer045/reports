# ESLint Issues Report - QAutos Backend

**Generated:** December 22, 2025 @ 12:33 PM  
**Total Issues:** 116 (0 errors, 116 warnings) ✅  
**Previous Status:** 583 issues (61 errors, 522 warnings)  
**Improvement:** 467 issues fixed (80% reduction!)

---

## 🎉 All Critical Errors Resolved!

All 61 critical errors from the previous report have been successfully fixed:

| Previously Fixed Issue      | Count | Status   |
| --------------------------- | ----- | -------- |
| `no-undef` (undefined vars) | 20    | ✅ Fixed |
| `no-var` (use let/const)    | 18    | ✅ Fixed |
| `no-dupe-keys`              | 2     | ✅ Fixed |
| `no-prototype-builtins`     | 3     | ✅ Fixed |
| `no-empty`                  | 3     | ✅ Fixed |
| `no-unreachable`            | 1     | ✅ Fixed |
| `no-fallthrough`            | 1     | ✅ Fixed |
| `no-async-promise-executor` | 1     | ✅ Fixed |
| `prefer-const` (auto-fixed) | ~300  | ✅ Fixed |
| `no-return-await`           | ~20   | ✅ Fixed |
| `eqeqeq`                    | 5     | ✅ Fixed |

---

## 📊 Current Status Summary

| Rule               | Type    | Count | Auto-fix? | Description                                 |
| ------------------ | ------- | ----- | --------- | ------------------------------------------- |
| `no-unused-vars`   | Warning | 98    | ❌ No     | Unused variables/imports to be removed      |
| `no-await-in-loop` | Warning | 15    | ❌ No     | `await` inside loops (potential perf issue) |
| `prefer-const`     | Warning | 3     | ✅ Yes    | Use `const` for never-reassigned variables  |

---

## � Remaining Warnings by Category

### 1. `no-unused-vars` (98 issues)

Declared but unused variables/imports. Should be manually reviewed and removed.

**Files affected:**

| File                                                            | Unused Variables                                                                  | Lines                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------- |
| `src/modules/payments/services/srvcPayments.js`                 | Op, fn, col, Pagination, vehicleInstance, data                                    | 2, 3, 5, 7           |
| `src/modules/payments/validations/valPayments.js`               | validateName, validateQID, validateNumber, validatePhone, validatePassword        | 4-10                 |
| `src/modules/vehicles/validations/valVehicle.js`                | validateName, validateQID, validateNumber, validatePhone, validatePassword, error | 4-10, 126            |
| `src/modules/vehicles/services/srvcVehicle.js`                  | parseError (x2), start, end, error                                                | 75, 104, 736, 815    |
| `src/modules/vehicles/controllers/ctrlVehicle.js`               | pickup_date, dropoff_date, success (x2)                                           | 186, 215, 250        |
| `src/modules/bookings/services/srvcBooking.js`                  | dError, confirmation (x2), error (x2), createdAttachments, checklistRecord        | Various              |
| `src/modules/bookings/routes/routesBooking.js`                  | multer, path                                                                      | 5, 6                 |
| `src/modules/bookings/controllers/ctrlBooking.js`               | index                                                                             | 227                  |
| `src/modules/bookings/validations/bookingValidations.js`        | error                                                                             | 177                  |
| `src/modules/adminRole/services/srvcAdminRole.js`               | isValid, updatedBooking, cErr, vErr                                               | 188, 205, 332, 333   |
| `src/modules/adminRole/validations/valAdminRole.js`             | validateQID, validateNumber, validatePassword                                     | 5, 6, 11             |
| `src/modules/adminRole/controllers/ctrlAdminRole.js`            | language                                                                          | 22                   |
| `src/modules/onboarding/controllers/ctrlOnboarding_customer.js` | sequelize, updatedUser (x3), userErr                                              | 8, 81, 121, 198, 248 |
| `src/modules/onboarding/controllers/ctrlOnboarding_admin.js`    | constants                                                                         | 3                    |
| `src/modules/onboarding/services/srvcOnboarding.js`             | updatedUser, savedDoc, err                                                        | 178, 227, 560        |
| `src/modules/onboarding/validations/valCustomer.js`             | validateName, validateQID                                                         | 4, 5                 |
| `src/modules/promo_codes/controllers/ctrlPromoCode.js`          | deleted                                                                           | 60                   |
| `src/modules/promo_codes/routes/routesPromoCode.js`             | router                                                                            | 2                    |
| `src/modules/payments/controllers/ctrlCyberSource.js`           | crypto, language, userId, bookingError, SECRET_KEY                                | 1, 14, 18, 160, 268  |
| `src/modules/payments/routes/routesCyberSource.js`              | Validation                                                                        | 3                    |
| `src/modules/payments/routes/routesTessCallbacks.js`            | Validation, vehicleRules                                                          | 3, 4                 |
| `src/modules/dashboard/controllers/ctrlDashboard.js`            | successMessages, response                                                         | 1, 4                 |
| `src/modules/dashboard/services/srvcDashboard.js`               | cError, thisError, lastError                                                      | 22, 36, 41           |
| `src/modules/dashboard/validations/valDashboard.js`             | validatePassword                                                                  | 4                    |
| `helpers/common.js`                                             | result, sendEmail                                                                 | 25, 294              |
| `helpers/pdfService.js`                                         | s3Url, dropoff_location, total_charges                                            | 74, 216, 221         |
| `middleware/auth_checker_2.js`                                  | configJSON, CONSTANTS                                                             | 2, 4                 |
| `utils/base_encoder.js`                                         | data_set                                                                          | 1                    |
| `utils/misc.js`                                                 | \_e                                                                               | 29                   |
| `utils/uploader.js`                                             | config                                                                            | 7                    |
| `utils/validation.js`                                           | code, \_err                                                                       | 4, 43                |

### 2. `no-await-in-loop` (15 issues)

`await` used inside loops can cause performance issues. Consider using `Promise.all()` for parallel execution.

| File                                                | Lines                            |
| --------------------------------------------------- | -------------------------------- |
| `src/modules/bookings/services/srvcBooking.js`      | 359, 370, 1017, 1337, 1339, 1618 |
| `src/modules/adminRole/services/srvcAdminRole.js`   | 657, 659, 664                    |
| `src/modules/onboarding/services/srvcOnboarding.js` | 209, 227, 556, 560               |
| `src/modules/promo_codes/services/srvcPromoCode.js` | 316, 344                         |

### 3. `prefer-const` (3 issues)

Variables declared with `let` but never reassigned.

| File                                                            | Line | Variables                                                         |
| --------------------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| `src/modules/bookings/services/srvcBooking.js`                  | 1367 | booking_id, new_status, type, date, digital_signature, admin_name |
| `src/modules/onboarding/controllers/ctrlOnboarding_customer.js` | 198  | userErr                                                           |

---

## 📁 Files with Most Issues

| File                                                            | Warnings |
| --------------------------------------------------------------- | -------- |
| `src/modules/bookings/services/srvcBooking.js`                  | 18       |
| `src/modules/payments/services/srvcPayments.js`                 | 6        |
| `src/modules/vehicles/validations/valVehicle.js`                | 6        |
| `src/modules/payments/validations/valPayments.js`               | 5        |
| `src/modules/vehicles/services/srvcVehicle.js`                  | 5        |
| `src/modules/onboarding/controllers/ctrlOnboarding_customer.js` | 5        |
| `src/modules/payments/controllers/ctrlCyberSource.js`           | 5        |
| `src/modules/adminRole/services/srvcAdminRole.js`               | 7        |
| `src/modules/onboarding/services/srvcOnboarding.js`             | 7        |

---

## 🛠️ Recommended Fix Order

### Phase 1: Quick Auto-fixes (Run `npm run lint:fix`)

This will fix the remaining 3 `prefer-const` issues automatically.

### Phase 2: Clean Up Unused Variables (Manual)

Remove unused imports and variables to reduce bundle size and improve code clarity:

1. **Remove unused validation imports** - Multiple validation files import validators that aren't used
2. **Remove unused destructured variables** - Many catch blocks have unused error variables
3. **Remove unused module imports** - Several files import modules that aren't being utilized

### Phase 3: Performance Optimization (Optional)

Consider refactoring `await` in loops to use `Promise.all()` for better performance:

```javascript
// Before (sequential)
for (const item of items) {
  await processItem(item);
}

// After (parallel)
await Promise.all(items.map((item) => processItem(item)));
```

---

## 📋 Commands

```bash
# View all issues
npm run lint

# Auto-fix remaining issues
npm run lint:fix

# Generate HTML report
npm run lint:report

# Check specific file
npx eslint path/to/file.js
```

---

## 📈 Progress Summary

| Metric           | Before (Dec 19) | After (Dec 22) | Change        |
| ---------------- | --------------- | -------------- | ------------- |
| **Errors**       | 61              | 0              | ✅ -61 (100%) |
| **Warnings**     | 522             | 116            | ✅ -406 (78%) |
| **Total**        | 583             | 116            | ✅ -467 (80%) |
| **Auto-fixable** | 368             | 3              | ✅ -365       |

---

_Report updated: December 22, 2025 @ 12:33 PM_  
_ESLint v9.39.2_
