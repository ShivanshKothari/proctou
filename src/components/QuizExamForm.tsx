import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ExamType, QuestionType } from '@prisma/client';
import { toast } from 'react-hot-toast';

const questionSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  optionA: z.string().min(1, 'Option A is required'),
  optionB: z.string().min(1, 'Option B is required'),
  optionC: z.string().optional(),
  optionD: z.string().optional(),
  correctAnswer: z.string().min(1, 'Correct answer is required'),
  marks: z.number().min(1, 'Marks must be at least 1'),
});

const examSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  type: z.nativeEnum(ExamType),
  duration: z.number().min(1, 'Duration must be at least 1 minute'),
  totalMarks: z.number().min(1, 'Total marks must be at least 1'),
  startDate: z.string().refine((date) => {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }, 'Invalid date format'),
  endDate: z.string().refine((date) => {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }, 'Invalid date format'),
  questions: z.array(questionSchema).min(1, 'At least one question is required'),
}).refine((data) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  return endDate > startDate;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

type ExamFormData = z.infer<typeof examSchema>;
type QuestionFormData = z.infer<typeof questionSchema>;

interface QuizExamFormProps {
  onSuccess?: () => void;
}

export function QuizExamForm({ onSuccess }: QuizExamFormProps) {
  const [questions, setQuestions] = useState<QuestionFormData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format date for datetime-local input
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const form = useForm<ExamFormData>({
    resolver: zodResolver(examSchema),
    defaultValues: {
      title: '',
      description: '',
      type: ExamType.QUIZ,
      duration: 60,
      totalMarks: 100,
      startDate: formatDateForInput(new Date()),
      endDate: formatDateForInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      questions: [],
    },
  });

  const questionForm = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctAnswer: '',
      marks: 1,
    },
  });

  const onSubmitQuestion = (data: QuestionFormData) => {
    try {
      const options = [
        data.optionA,
        data.optionB,
        data.optionC,
        data.optionD,
      ].filter((option): option is string => Boolean(option));

      if (options.length < 2) {
        toast.error('Please provide at least 2 options');
        return;
      }

      setQuestions(prev => [...prev, data]);
      questionForm.reset({
        question: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctAnswer: '',
        marks: 1,
      });
      toast.success('Question added successfully');
    } catch (error) {
      console.error('Error adding question:', error);
      toast.error('Failed to add question');
    }
  };

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
    toast.success('Question removed');
  };

  const onSubmit = async (data: z.infer<typeof examSchema>) => {
    console.log('Form submitted with data:', data);
    console.log('Current questions state:', questions);
    
    try {
      setIsSubmitting(true);
      console.log('Setting isSubmitting to true');
      
      if (questions.length === 0) {
        console.log('No questions added');
        toast.error('Please add at least one question');
        setIsSubmitting(false);
        return;
      }

      // Calculate total marks from questions
      const totalQuestionMarks = questions.reduce((sum, q) => sum + q.marks, 0);
      
      // Check if total marks match
      if (totalQuestionMarks !== data.totalMarks) {
        toast.error(`Total marks (${data.totalMarks}) does not match the sum of question marks (${totalQuestionMarks})`);
        setIsSubmitting(false);
        return;
      }

      // Format dates to ISO string
      const startDate = new Date(data.startDate).toISOString();
      const endDate = new Date(data.endDate).toISOString();

      const formData = {
        ...data,
        type: ExamType.QUIZ,
        startDate,
        endDate,
        questions: questions.map(q => {
          // Map correct answer letter to actual option text
          let correctAnswerText = '';
          if (q.correctAnswer === 'A' && q.optionA) correctAnswerText = q.optionA;
          else if (q.correctAnswer === 'B' && q.optionB) correctAnswerText = q.optionB;
          else if (q.correctAnswer === 'C' && q.optionC) correctAnswerText = q.optionC;
          else if (q.correctAnswer === 'D' && q.optionD) correctAnswerText = q.optionD;
          
          console.log(`Question: ${q.question}, Correct answer letter: ${q.correctAnswer}, Mapped to: ${correctAnswerText}`);
          
          return {
            type: QuestionType.MULTIPLE_CHOICE,
            question: q.question,
            options: [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean),
            correctAnswer: correctAnswerText,
            marks: q.marks,
          };
        }),
      };

      console.log('Submitting form data:', formData);

      const response = await fetch('/api/exam', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('API Response:', result);

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create exam');
      }

      toast.success('Exam created successfully');
      form.reset();
      setQuestions([]);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating exam:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create exam');
    } finally {
      setIsSubmitting(false);
      console.log('Setting isSubmitting to false');
    }
  };

  // Add a click handler to the submit button
  const handleSubmitClick = (e: React.MouseEvent) => {
    e.preventDefault();
    console.log('Submit button clicked');
    console.log('Form state:', form.formState);
    console.log('Questions state:', questions);
    
    // Validate the form first
    const isValid = form.trigger();
    if (!isValid) {
      console.log('Form validation failed');
      return;
    }

    // Get the form data
    const formData = form.getValues();
    console.log('Form data:', formData);

    // Call onSubmit with the form data
    onSubmit(formData);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => {
        e.preventDefault();
        handleSubmitClick(e as any);
      }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            {...form.register('title')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
          {form.formState.errors.title && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            {...form.register('description')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            rows={3}
          />
          {form.formState.errors.description && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.description.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
            <input
              type="number"
              {...form.register('duration', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            {form.formState.errors.duration && (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.duration.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Total Marks</label>
            <input
              type="number"
              {...form.register('totalMarks', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            {form.formState.errors.totalMarks && (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.totalMarks.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              type="datetime-local"
              {...form.register('startDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            {form.formState.errors.startDate && (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.startDate.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              type="datetime-local"
              {...form.register('endDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            {form.formState.errors.endDate && (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.endDate.message}</p>
            )}
          </div>
        </div>

        <div className="pt-4">
          <h3 className="text-lg font-medium text-gray-900">Questions</h3>
          <div className="mt-4 space-y-4">
            {questions.map((q, index) => (
              <div key={index} className="mb-4 bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{q.question}</p>
                    <p className="text-sm text-gray-500">Marks: {q.marks}</p>
                    <p className="text-sm text-gray-500">
                      Correct Answer: {q.correctAnswer === 'A' ? q.optionA : 
                                     q.correctAnswer === 'B' ? q.optionB : 
                                     q.correctAnswer === 'C' ? q.optionC : 
                                     q.correctAnswer === 'D' ? q.optionD : 
                                     q.correctAnswer}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4">
          <h3 className="text-lg font-medium text-gray-900">Add Question</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Question</label>
              <textarea
                {...questionForm.register('question')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                rows={2}
              />
              {questionForm.formState.errors.question && (
                <p className="mt-1 text-sm text-red-600">{questionForm.formState.errors.question.message}</p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Option A</label>
                <input
                  type="text"
                  {...questionForm.register('optionA')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                {questionForm.formState.errors.optionA && (
                  <p className="mt-1 text-sm text-red-600">{questionForm.formState.errors.optionA.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Option B</label>
                <input
                  type="text"
                  {...questionForm.register('optionB')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                {questionForm.formState.errors.optionB && (
                  <p className="mt-1 text-sm text-red-600">{questionForm.formState.errors.optionB.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Option C</label>
                <input
                  type="text"
                  {...questionForm.register('optionC')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                {questionForm.formState.errors.optionC && (
                  <p className="mt-1 text-sm text-red-600">{questionForm.formState.errors.optionC.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Option D</label>
                <input
                  type="text"
                  {...questionForm.register('optionD')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                {questionForm.formState.errors.optionD && (
                  <p className="mt-1 text-sm text-red-600">{questionForm.formState.errors.optionD.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Correct Answer</label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      {...questionForm.register('correctAnswer')}
                      value="A"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <label className="ml-3 block text-sm font-medium text-gray-700">Option A</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      {...questionForm.register('correctAnswer')}
                      value="B"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <label className="ml-3 block text-sm font-medium text-gray-700">Option B</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      {...questionForm.register('correctAnswer')}
                      value="C"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <label className="ml-3 block text-sm font-medium text-gray-700">Option C</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      {...questionForm.register('correctAnswer')}
                      value="D"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <label className="ml-3 block text-sm font-medium text-gray-700">Option D</label>
                  </div>
                </div>
                {questionForm.formState.errors.correctAnswer && (
                  <p className="mt-1 text-sm text-red-600">{questionForm.formState.errors.correctAnswer.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Marks</label>
              <input
                type="number"
                {...questionForm.register('marks', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              {questionForm.formState.errors.marks && (
                <p className="mt-1 text-sm text-red-600">{questionForm.formState.errors.marks.message}</p>
              )}
            </div>

            <button
              type="button"
              onClick={questionForm.handleSubmit(onSubmitQuestion)}
              className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Add Question
            </button>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting || questions.length === 0}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Quiz'}
          </button>
        </div>
      </form>
    </div>
  );
} 