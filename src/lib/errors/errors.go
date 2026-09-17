package errors

import "fmt"

type AppError struct {
	Code    string
	Status  int
	Message string
}

func (e *AppError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}

func New(code string, status int) *AppError {
	return &AppError{Code: code, Status: status}
}

func Newf(code string, status int, format string, args ...any) *AppError {
	return &AppError{
		Code:    code,
		Status:  status,
		Message: fmt.Sprintf(format, args...),
	}
}

func IsAppError(err error) (*AppError, bool) {
	appErr, ok := err.(*AppError)
	return appErr, ok
}
