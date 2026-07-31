from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Operation = Literal[
    "add",
    "subtract",
    "multiply",
    "divide",
    "percentage",
    "weighted_average",
    "break_even",
]


class CalculationInput(BaseModel):
    value: Decimal
    unit: str = Field(min_length=1, max_length=32)
    source: str = Field(min_length=1, max_length=200)


class CalculationRequest(BaseModel):
    operation: Operation
    inputs: list[CalculationInput] = Field(min_length=1, max_length=10)
    rounding: int = Field(default=2, ge=0, le=8)

    @model_validator(mode="after")
    def validate_arity(self) -> "CalculationRequest":
        required = {"subtract": 2, "divide": 2, "percentage": 2, "break_even": 2}
        if self.operation in required and len(self.inputs) != required[self.operation]:
            raise ValueError(f"{self.operation} requires exactly {required[self.operation]} inputs")
        if self.operation == "weighted_average" and len(self.inputs) < 4:
            raise ValueError("weighted_average requires value and weight pairs")
        if self.operation == "weighted_average" and len(self.inputs) % 2:
            raise ValueError("weighted_average requires an even number of inputs")
        return self


class CalculationResult(BaseModel):
    formula: str
    inputs: list[CalculationInput]
    units: list[str]
    result: Decimal
    rounding_rule: str = Field(alias="roundingRule")


def calculate(request: CalculationRequest) -> CalculationResult:
    values = [item.value for item in request.inputs]
    operation = request.operation
    result: Decimal
    formula: str
    if operation == "add":
        result, formula = sum(values, start=Decimal("0")), "sum(inputs)"
    elif operation == "subtract":
        result, formula = values[0] - values[1], "input[0] - input[1]"
    elif operation == "multiply":
        result, formula = _product(values), "product(inputs)"
    elif operation == "divide":
        if values[1] == 0:
            raise ValueError("division by zero")
        result, formula = values[0] / values[1], "input[0] / input[1]"
    elif operation == "percentage":
        if values[1] == 0:
            raise ValueError("division by zero")
        result, formula = (values[0] / values[1]) * Decimal("100"), "input[0] / input[1] * 100"
    elif operation == "weighted_average":
        weighted_values = values[::2]
        weights = values[1::2]
        weight_total = sum(weights)
        if weight_total == 0:
            raise ValueError("weights must not sum to zero")
        result = (
            sum(value * weight for value, weight in zip(weighted_values, weights, strict=True))
            / weight_total
        )
        formula = "sum(value * weight) / sum(weight)"
    else:
        if values[1] == 0:
            raise ValueError("division by zero")
        result, formula = values[0] / values[1], "fixed_cost / contribution_per_unit"
    quantum = Decimal(1).scaleb(-request.rounding)
    return CalculationResult(
        formula=formula,
        inputs=request.inputs,
        units=sorted({item.unit for item in request.inputs}),
        result=result.quantize(quantum, rounding=ROUND_HALF_UP),
        roundingRule=f"half-up to {request.rounding} decimal places",
    )


def _product(values: list[Decimal]) -> Decimal:
    result = Decimal("1")
    for value in values:
        result *= value
    return result
