// Calculator state - stores all the information we need
const calculator = {
    displayValue: '0',
    firstOperand: null,
    waitingForSecondOperand: false,
    operator: null,
};

// Update the display with current values
function updateDisplay() {
    const display = document.querySelector('.current-operand');
    display.textContent = calculator.displayValue;
    
    const previousDisplay = document.querySelector('.previous-operand');
    if (calculator.operator && calculator.firstOperand !== null) {
        previousDisplay.textContent = `${calculator.firstOperand} ${calculator.operator}`;
    } else {
        previousDisplay.textContent = '';
    }
}

// Handle number input
function inputDigit(digit) {
    const { displayValue, waitingForSecondOperand } = calculator;
    
    if (waitingForSecondOperand === true) {
        calculator.displayValue = digit;
        calculator.waitingForSecondOperand = false;
    } else {
        calculator.displayValue = displayValue === '0' ? digit : displayValue + digit;
    }
}

// Handle decimal point
function inputDecimal(dot) {
    if (calculator.waitingForSecondOperand === true) {
        calculator.displayValue = '0.';
        calculator.waitingForSecondOperand = false;
        return;
    }
    
    if (!calculator.displayValue.includes(dot)) {
        calculator.displayValue += dot;
    }
}

// Handle operator buttons
function handleOperator(nextOperator) {
    const { firstOperand, displayValue, operator } = calculator;
    const inputValue = parseFloat(displayValue);
    
    if (operator && calculator.waitingForSecondOperand) {
        calculator.operator = nextOperator;
        return;
    }
    
    if (firstOperand === null && !isNaN(inputValue)) {
        calculator.firstOperand = inputValue;
    } else if (operator) {
        const result = calculate(firstOperand, inputValue, operator);
        
        calculator.displayValue = `${parseFloat(result.toFixed(7))}`;
        calculator.firstOperand = result;
    }
    
    calculator.waitingForSecondOperand = true;
    calculator.operator = nextOperator;
}

// Perform the actual calculation
function calculate(firstOperand, secondOperand, operator) {
    switch (operator) {
        case '+':
            return firstOperand + secondOperand;
        case '-':
            return firstOperand - secondOperand;
        case '×':
            return firstOperand * secondOperand;
        case '÷':
            return firstOperand / secondOperand;
        default:
            return secondOperand;
    }
}

// Reset calculator
function resetCalculator() {
    calculator.displayValue = '0';
    calculator.firstOperand = null;
    calculator.waitingForSecondOperand = false;
    calculator.operator = null;
}

// Delete last digit
function deleteDigit() {
    const { displayValue } = calculator;
    calculator.displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : '0';
}

// Event listeners for all buttons
document.querySelector('.buttons').addEventListener('click', (event) => {
    const { target } = event;
    
    if (!target.matches('button')) {
        return;
    }
    
    if (target.dataset.number) {
        inputDigit(target.dataset.number);
        updateDisplay();
        return;
    }
    
    if (target.dataset.operator) {
        handleOperator(target.dataset.operator);
        updateDisplay();
        return;
    }
    
    if (target.dataset.action) {
        switch (target.dataset.action) {
            case 'clear':
                resetCalculator();
                break;
            case 'delete':
                deleteDigit();
                break;
            case 'equals':
                handleOperator('=');
                calculator.operator = null;
                calculator.waitingForSecondOperand = false;
                break;
        }
        updateDisplay();
    }
});

// Initialize display
updateDisplay();

