import { Router } from "express";
import {
  PricingController,
  createPricingValidation,
  updatePricingValidation,
  pricingIdValidation,
} from "../controllers/Pricingcontroller";
import authenticate from "../middleware/auth";

const router = Router();


router.get("/", PricingController.getAll);


router.get(
  "/all",
   
  PricingController.getAllAdmin
);


router.get(
  "/:id",
   
  pricingIdValidation,
  PricingController.getOne
);

router.post(
  "/",
   authenticate,
  createPricingValidation,
  PricingController.create
);


router.put(
  "/reorder",
   
  PricingController.reorder
);


router.put(
  "/:id",
   
  updatePricingValidation,
  PricingController.update
);


router.patch(
  "/:id/toggle",
   
  pricingIdValidation,
  PricingController.toggleActive
);


router.delete(
  "/:id",
   
  pricingIdValidation,
  PricingController.remove
);

export default router;