`timescale 1ns/1ps

module fdiv_oracle_tb;
  reg clk = 0, rst_n = 0, start = 0;
  reg [31:0] a = 0, b = 0;
  reg [31:0] av, bv;
  reg [1023:0] vector_path;
  integer fd, count, scanned;
  wire [31:0] result;
  wire valid, overflow, underflow, division_by_zero, invalid, inexact;

  fdiv dut(.clk(clk),.rst_n(rst_n),.a(a),.b(b),.start(start),.result(result),
    .valid(valid),.overflow(overflow),.underflow(underflow),
    .division_by_zero(division_by_zero),.invalid(invalid),.inexact(inexact));

  always #5 clk = ~clk;

  task run_case(input [31:0] a_value, input [31:0] b_value);
    begin
      a = a_value;
      b = b_value;
      start = 1;
      @(posedge clk);
      #1 start = 0;
      @(posedge clk);
      #1 $display("RESULT %08x %08x %08x %0d %0d %0d %0d %0d",
        a_value, b_value, result, overflow, underflow,
        division_by_zero, invalid, inexact);
    end
  endtask

  initial begin
    if (!$value$plusargs("VECTORS=%s", vector_path)) begin
      $display("ERROR missing +VECTORS=path");
      $finish_and_return(2);
    end
    fd = $fopen(vector_path, "r");
    if (fd == 0) begin
      $display("ERROR cannot open vectors");
      $finish_and_return(2);
    end
    #12 rst_n = 1;
    #1;
    count = 0;
    while (!$feof(fd)) begin
      scanned = $fscanf(fd, "%h %h\n", av, bv);
      if (scanned == 2) begin
        run_case(av, bv);
        count = count + 1;
      end
    end
    $fclose(fd);
    $display("DONE %0d", count);
    $finish;
  end
endmodule
