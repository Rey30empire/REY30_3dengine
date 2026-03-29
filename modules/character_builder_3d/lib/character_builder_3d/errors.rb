# frozen_string_literal: true

module CharacterBuilder3D
  # Base error for the module.
  class Error < StandardError; end

  # Raised when the requested part does not exist in the library.
  class PartNotFoundError < Error
    def initialize(part_id)
      super("Part not found: #{part_id}")
    end
  end

  # Raised when the builder receives an unknown category or drop zone.
  class InvalidCategoryError < Error
    def initialize(category, expected: nil)
      message = +"Invalid category: #{category}"
      message << " (expected #{expected})" if expected
      super(message)
    end
  end

  # Raised when a modular part is applied before a body is loaded.
  class BaseCharacterNotLoadedError < Error
    def initialize
      super('Load a base body before applying modular parts')
    end
  end

  # Raised when compatibility checks fail.
  class IncompatiblePartError < Error
    attr_reader :report

    def initialize(report)
      @report = report
      super(report.message)
    end
  end
end
