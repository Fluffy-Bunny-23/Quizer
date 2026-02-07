import {
  sanitizeInput,
  validateTitle,
  validateDescription,
  validateQuestion,
  validateOption,
  isValidTitle,
  isValidDescription,
  containsXSSPatterns,
  sanitizeQuizImport,
} from '../utils';

describe('sanitizeInput', () => {
  it('should trim whitespace and limit length', () => {
    expect(sanitizeInput('  hello world  ', 100)).toBe('hello world');
    expect(sanitizeInput('hello', 3)).toBe('hel');
  });

  it('should remove HTML tags and dangerous characters', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
    expect(sanitizeInput('hello <b>world</b>')).toBe('hello bworld/b');
    // Note: & is NOT removed by sanitizeInput (only < > " ' are removed)
    expect(sanitizeInput('test & more')).toBe('test & more');
    expect(sanitizeInput('quote "test"')).toBe('quote test');
    expect(sanitizeInput("apostrophe 'test'")).toBe('apostrophe test');
  });

  it('should handle empty or null input', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null as any)).toBe('');
    expect(sanitizeInput(undefined as any)).toBe('');
  });

  it('should respect maxLength parameter', () => {
    const longString = 'a'.repeat(200);
    expect(sanitizeInput(longString, 50).length).toBe(50);
    expect(sanitizeInput(longString, 100).length).toBe(100);
  });
});

describe('validateTitle', () => {
  it('should return error for empty title', () => {
    expect(validateTitle('')).toBe('Title is required');
    expect(validateTitle('   ')).toBe('Title is required');
  });

  it('should return error for short title', () => {
    expect(validateTitle('ab')).toBe('Title must be at least 3 characters');
    expect(validateTitle('a')).toBe('Title must be at least 3 characters');
  });

  it('should return error for long title', () => {
    const longTitle = 'a'.repeat(101);
    expect(validateTitle(longTitle)).toBe('Title must be 100 characters or less');
  });

  it('should return null for valid title', () => {
    expect(validateTitle('Valid Title')).toBeNull();
    expect(validateTitle('abc')).toBeNull();
    expect(validateTitle('a'.repeat(100))).toBeNull();
  });
});

describe('validateDescription', () => {
  it('should return null for empty description', () => {
    expect(validateDescription('')).toBeNull();
    expect(validateDescription(null as any)).toBeNull();
  });

  it('should return error for long description', () => {
    const longDesc = 'a'.repeat(501);
    expect(validateDescription(longDesc)).toBe('Description must be 500 characters or less');
  });

  it('should return null for valid description', () => {
    expect(validateDescription('A valid description')).toBeNull();
    expect(validateDescription('a'.repeat(500))).toBeNull();
  });
});

describe('validateQuestion', () => {
  it('should return error for empty question', () => {
    expect(validateQuestion('')).toBe('Question is required');
    expect(validateQuestion('   ')).toBe('Question is required');
  });

  it('should return error for short question', () => {
    expect(validateQuestion('ab')).toBe('Question must be at least 3 characters');
  });

  it('should return error for long question', () => {
    const longQuestion = 'a'.repeat(501);
    expect(validateQuestion(longQuestion)).toBe('Question must be 500 characters or less');
  });

  it('should return null for valid question', () => {
    expect(validateQuestion('What is the capital of France?')).toBeNull();
    expect(validateQuestion('abc')).toBeNull();
  });
});

describe('validateOption', () => {
  it('should return error for empty option', () => {
    expect(validateOption('')).toBe('Option is required');
    expect(validateOption('   ')).toBe('Option is required');
  });

  it('should return error for long option', () => {
    const longOption = 'a'.repeat(201);
    expect(validateOption(longOption)).toBe('Option must be 200 characters or less');
  });

  it('should return null for valid option', () => {
    expect(validateOption('Paris')).toBeNull();
    expect(validateOption('a'.repeat(200))).toBeNull();
  });
});

describe('isValidTitle', () => {
  it('should return true for valid titles', () => {
    expect(isValidTitle('Valid Title')).toBe(true);
    expect(isValidTitle('abc')).toBe(true);
  });

  it('should return false for invalid titles', () => {
    expect(isValidTitle('')).toBe(false);
    expect(isValidTitle('ab')).toBe(false);
  });
});

describe('isValidDescription', () => {
  it('should return true for valid descriptions', () => {
    expect(isValidDescription('A valid description')).toBe(true);
    expect(isValidDescription('')).toBe(true);
  });

  it('should return false for invalid descriptions', () => {
    expect(isValidDescription('a'.repeat(501))).toBe(false);
  });
});

describe('containsXSSPatterns', () => {
  it('should detect HTML tags', () => {
    expect(containsXSSPatterns('<script>')).toBe(true);
    expect(containsXSSPatterns('<div>')).toBe(true);
    expect(containsXSSPatterns('<img src=x onerror=alert(1)>')).toBe(true);
  });

  it('should detect script tags', () => {
    expect(containsXSSPatterns('<script>alert("xss")</script>')).toBe(true);
  });

  it('should detect javascript URLs', () => {
    expect(containsXSSPatterns('javascript:alert(1)')).toBe(true);
    expect(containsXSSPatterns('javascript:void(0)')).toBe(true);
  });

  it('should detect event handlers', () => {
    expect(containsXSSPatterns('onclick=alert(1)')).toBe(true);
    expect(containsXSSPatterns('onload=steal()')).toBe(true);
  });

  it('should detect HTML entities', () => {
    expect(containsXSSPatterns('&lt;script&gt;')).toBe(true);
    expect(containsXSSPatterns('&#39;')).toBe(true);
    expect(containsXSSPatterns('&quot;')).toBe(true);
  });

  it('should detect iframes and objects', () => {
    expect(containsXSSPatterns('<iframe>')).toBe(true);
    expect(containsXSSPatterns('<object>')).toBe(true);
    expect(containsXSSPatterns('<embed>')).toBe(true);
  });

  it('should detect CSS expressions', () => {
    expect(containsXSSPatterns('expression(alert(1))')).toBe(true);
  });

  it('should return false for safe text', () => {
    expect(containsXSSPatterns('Hello World')).toBe(false);
    expect(containsXSSPatterns('What is 2+2?')).toBe(false);
    expect(containsXSSPatterns('Paris, France')).toBe(false);
  });

  it('should handle empty input', () => {
    expect(containsXSSPatterns('')).toBe(false);
    expect(containsXSSPatterns(null as any)).toBe(false);
    expect(containsXSSPatterns(undefined as any)).toBe(false);
  });
});

describe('sanitizeQuizImport', () => {
  it('should sanitize valid quiz data', () => {
    const quiz = {
      title: 'Test Quiz',
      description: 'A test quiz',
      questions: [
        {
          question: 'What is 2+2?',
          options: ['3', '4', '5', '6'],
          correctIndices: [1],
          timeLimit: 20,
        },
      ],
    };

    const { sanitized, errors } = sanitizeQuizImport(quiz);

    expect(errors).toHaveLength(0);
    expect(sanitized.title).toBe('Test Quiz');
    expect(sanitized.questions).toHaveLength(1);
    expect(sanitized.questions[0].options).toHaveLength(4);
  });

  it('should detect XSS patterns in quiz data', () => {
    const quiz = {
      title: '<script>alert(1)</script>',
      questions: [
        {
          question: 'What is this?',
          options: ['<img onerror=alert(1)>'],
          correctIndices: [0],
          timeLimit: 20,
        },
      ],
    };

    const { sanitized, errors } = sanitizeQuizImport(quiz);

    expect(errors).toContain('Quiz title contains suspicious patterns');
    expect(errors).toContain('Question 1, Option 1: Contains suspicious patterns');
    expect(sanitized.title).not.toContain('<script>');
  });

  it('should report missing title', () => {
    const quiz = {
      questions: [],
    };

    const { errors } = sanitizeQuizImport(quiz);

    expect(errors).toContain('Missing or invalid quiz title');
  });

  it('should report missing questions array', () => {
    const quiz = {
      title: 'Test Quiz',
    };

    const { errors } = sanitizeQuizImport(quiz);

    expect(errors).toContain('Missing or invalid questions array');
  });

  it('should handle invalid question formats', () => {
    const quiz = {
      title: 'Test Quiz',
      questions: [
        {
          options: ['A', 'B'],
        },
      ],
    };

    const { errors } = sanitizeQuizImport(quiz);

    expect(errors).toContain('Question 1: Missing or invalid question text');
  });

  it('should sanitize option strings', () => {
    const quiz = {
      title: 'Test Quiz',
      questions: [
        {
          question: 'Question 1',
          options: ['<b>Option 1</b>', 'Option 2'],
          correctIndices: [0],
          timeLimit: 20,
        },
      ],
    };

    const { sanitized } = sanitizeQuizImport(quiz);

    expect(sanitized.questions[0].options[0]).toBe('bOption 1/b');
  });

  it('should clamp time limits to valid range', () => {
    const quiz = {
      title: 'Test Quiz',
      questions: [
        {
          question: 'Q1',
          options: ['A', 'B'],
          correctIndices: [0],
          timeLimit: 1, // Too low - gets clamped to min 5
        },
        {
          question: 'Q2',
          options: ['A', 'B'],
          correctIndices: [0],
          timeLimit: 500, // Too high
        },
        {
          question: 'Q3',
          options: ['A', 'B'],
          correctIndices: [0],
          timeLimit: 0, // Zero - gets default
        },
      ],
    };

    const { sanitized } = sanitizeQuizImport(quiz);

    expect(sanitized.questions[0].timeLimit).toBe(5); // Min
    expect(sanitized.questions[1].timeLimit).toBe(300); // Max
    expect(sanitized.questions[2].timeLimit).toBe(20); // Default for invalid
  });

  it('should filter invalid correct indices', () => {
    const quiz = {
      title: 'Test Quiz',
      questions: [
        {
          question: 'Q1',
          options: ['A', 'B', 'C'],
          correctIndices: [0, 'invalid', -1, 1.5, 2],
          timeLimit: 20,
        },
      ],
    };

    const { sanitized } = sanitizeQuizImport(quiz);

    // 0 and 2 are valid non-negative integers; 'invalid', -1, and 1.5 are filtered
    expect(sanitized.questions[0].correctIndices).toEqual([0, 2]);
  });

  it('should handle empty description', () => {
    const quiz = {
      title: 'Test Quiz',
      questions: [],
    };

    const { sanitized, errors } = sanitizeQuizImport(quiz);

    expect(sanitized.description).toBe('');
    expect(errors).not.toContain('Invalid description format');
  });

  it('should report invalid description format', () => {
    const quiz = {
      title: 'Test Quiz',
      description: 12345,
      questions: [],
    };

    const { errors } = sanitizeQuizImport(quiz);

    expect(errors).toContain('Invalid description format');
  });

  it('should report invalid option formats', () => {
    const quiz = {
      title: 'Test Quiz',
      questions: [
        {
          question: 'Q1',
          options: ['A', 123, null],
          correctIndices: [0],
          timeLimit: 20,
        },
      ],
    };

    const { errors } = sanitizeQuizImport(quiz);

    expect(errors).toContain('Question 1, Option 2: Invalid option format');
    expect(errors).toContain('Question 1, Option 3: Invalid option format');
  });
});
