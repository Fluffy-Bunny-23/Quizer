/**
 * Sanitizes user input to prevent XSS attacks
 * Removes dangerous HTML characters: <, >, &, ", '
 * Trims whitespace and limits string length
 */
export function sanitizeInput(input: string, maxLength: number = 100): string {
  if (!input) return '';
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"']/g, '');
}

/**
 * Validates quiz title
 * Required, 3-100 characters
 */
export function validateTitle(title: string): string | null {
  if (!title.trim()) return 'Title is required';
  if (title.trim().length < 3) return 'Title must be at least 3 characters';
  if (title.length > 100) return 'Title must be 100 characters or less';
  return null;
}

/**
 * Validates quiz description
 * Optional, max 500 characters
 */
export function validateDescription(description: string): string | null {
  if (!description) return null;
  if (description.length > 500) return 'Description must be 500 characters or less';
  return null;
}

/**
 * Validates question text
 * Required, 3-500 characters
 */
export function validateQuestion(question: string): string | null {
  if (!question.trim()) return 'Question is required';
  if (question.trim().length < 3) return 'Question must be at least 3 characters';
  if (question.length > 500) return 'Question must be 500 characters or less';
  return null;
}

/**
 * Validates option text
 * Required, 1-200 characters
 */
export function validateOption(option: string): string | null {
  if (!option.trim()) return 'Option is required';
  if (option.length > 200) return 'Option must be 200 characters or less';
  return null;
}

/**
 * Checks if title is valid (boolean helper)
 */
export function isValidTitle(title: string): boolean {
  return validateTitle(title) === null;
}

/**
 * Checks if description is valid (boolean helper)
 */
export function isValidDescription(description: string): boolean {
  return validateDescription(description) === null;
}

/**
 * Checks if a string contains potential XSS patterns
 * Returns true if suspicious patterns are detected
 */
export function containsXSSPatterns(input: string): boolean {
  if (!input) return false;
  
  // Check for HTML tags, script patterns, event handlers, and javascript URLs
  const xssPatterns = [
    /<[^>]*>/,                              // HTML tags
    /<script[^>]*>.*?<\/script>/i,          // Script tags
    /javascript:/i,                         // JavaScript URLs
    /on\w+\s*=/i,                          // Event handlers (onclick, onload, etc.)
    /&#x?[0-9a-f]+;/i,                      // HTML entities
    /&lt;|&gt;|&quot;|&#39;|&amp;/i,        // Encoded HTML entities
    /\\x[0-9a-f]{2}/i,                     // Hex-encoded characters
    /\\u[0-9a-f]{4}/i,                     // Unicode escape sequences
    /<iframe/i,                             // Iframes
    /<object/i,                             // Object tags
    /<embed/i,                              // Embed tags
    /expression\s*\(/i,                     // CSS expressions
    /url\s*\(\s*['"]?\s*javascript:/i,     // CSS JavaScript URLs
  ];
  
  return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Validates and sanitizes imported quiz data
 * Checks for XSS patterns in all text fields and returns sanitized quiz object
 */
export function sanitizeQuizImport(quiz: any): { sanitized: any; errors: string[] } {
  const errors: string[] = [];
  const sanitized: any = {};
  
  // Validate and sanitize title
  if (!quiz.title || typeof quiz.title !== 'string') {
    errors.push('Missing or invalid quiz title');
  } else {
    if (containsXSSPatterns(quiz.title)) {
      errors.push('Quiz title contains suspicious patterns');
    }
    sanitized.title = sanitizeInput(quiz.title, 100);
  }
  
  // Validate and sanitize description
  if (quiz.description !== undefined) {
    if (typeof quiz.description !== 'string') {
      errors.push('Invalid description format');
    } else {
      if (containsXSSPatterns(quiz.description)) {
        errors.push('Quiz description contains suspicious patterns');
      }
      sanitized.description = sanitizeInput(quiz.description, 500);
    }
  } else {
    sanitized.description = '';
  }
  
  // Validate and sanitize questions
  if (!Array.isArray(quiz.questions)) {
    errors.push('Missing or invalid questions array');
  } else {
    sanitized.questions = quiz.questions.map((q: any, index: number) => {
      const sanitizedQuestion: any = {};
      
      // Validate question text
      if (!q.question || typeof q.question !== 'string') {
        errors.push(`Question ${index + 1}: Missing or invalid question text`);
      } else {
        if (containsXSSPatterns(q.question)) {
          errors.push(`Question ${index + 1}: Contains suspicious patterns`);
        }
        sanitizedQuestion.question = sanitizeInput(q.question, 500);
      }
      
      // Validate and sanitize options
      if (!Array.isArray(q.options)) {
        errors.push(`Question ${index + 1}: Missing or invalid options`);
      } else {
        sanitizedQuestion.options = q.options.map((opt: any, optIndex: number) => {
          if (typeof opt !== 'string') {
            errors.push(`Question ${index + 1}, Option ${optIndex + 1}: Invalid option format`);
            return '';
          }
          if (containsXSSPatterns(opt)) {
            errors.push(`Question ${index + 1}, Option ${optIndex + 1}: Contains suspicious patterns`);
          }
          return sanitizeInput(opt, 200);
        });
      }
      
      // Copy correct indices (validate they are numbers)
      if (Array.isArray(q.correctIndices)) {
        sanitizedQuestion.correctIndices = q.correctIndices.filter((i: any) => 
          typeof i === 'number' && Number.isInteger(i) && i >= 0
        );
      } else {
        sanitizedQuestion.correctIndices = [];
      }
      
      // Validate time limit
      sanitizedQuestion.timeLimit = typeof q.timeLimit === 'number' && q.timeLimit > 0 
        ? Math.min(Math.max(q.timeLimit, 5), 300) 
        : 20;
      
      return sanitizedQuestion;
    });
  }
  
  return { sanitized, errors };
}
